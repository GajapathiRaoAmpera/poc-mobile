/// One screen for the whole delivery: whichever agent is active speaks, and everything is done by voice.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';
import '../voice/audio.dart';
import '../voice/delivery_voice.dart';
import '../voice/live_client.dart';
import 'chat.dart';
import 'project.dart';

const _live = {VoiceState.listening, VoiceState.thinking, VoiceState.speaking};

/// Each agent's look on the voice screen; the orb takes the active agent's tint.
const voiceAgent = <String, ({String short, IconData icon, Color tint})>{
  'intake': (short: 'Orchestrator', icon: Icons.explore_outlined, tint: C.primary),
  'requirements': (short: 'Requirements', icon: Icons.checklist, tint: C.lavender),
  'architecture': (short: 'Architecture', icon: Icons.hub_outlined, tint: C.navy),
  'plan': (short: 'Plan', icon: Icons.calendar_month_outlined, tint: C.info),
  'budget': (short: 'Budget', icon: Icons.account_balance_wallet_outlined, tint: C.success),
  'code': (short: 'Development', icon: Icons.code, tint: C.warning),
};

/// Keeps the newest words on screen while the caption grows.
String _tail(String s, [int n = 220]) => s.length > n ? '…${s.substring(s.length - n).replaceFirst(RegExp(r'^\S*\s'), '')}' : s;

/// What the delivery is waiting for, phrased as what to say next.
String deliveryLine(Map<String, dynamic>? d) {
  if (d == null) return '';
  final p = d['pending'] as Map<String, dynamic>?;
  final stage = gateStage(d);
  final label = stage != null && stage != 'orchestrator' ? stageLabel[stage] : null;
  final message = cleanMessage('${d['message'] ?? ''}');
  switch (p?['kind']) {
    case 'approval':
      final rev = (p?['payload'] as Map?)?['revision'] ?? '';
      return 'Waiting for your approval of ${label ?? 'the draft'} revision $rev — say "approve" or "request changes"';
    case 'awaiting_answers':
      return 'The Requirements Agent has open questions — answer them out loud';
    case 'intake_questions':
      return 'The Project Orchestrator has questions — answer them out loud';
    case 'needs_input' || 'quota' || 'failed' || 'cancelled':
      return '$message — say "resume" when you\'re ready';
  }
  if (d['status'] == 'DONE') return 'Delivery complete — ask anything about it';
  return message.isNotEmpty ? message : (d['status'] == 'RUNNING' ? 'The agents are working' : '');
}

String voiceLine(VoiceSnapshot v, String name) {
  if (v.switching) return 'Switching to $name… keep talking';
  return switch (v.state) {
    VoiceState.connecting => 'Connecting…',
    VoiceState.listening => v.muted ? 'Microphone off — the delivery keeps going' : 'Listening',
    VoiceState.thinking => '$name is working…',
    VoiceState.speaking => '$name · Talk anytime to interrupt',
    VoiceState.paused => '${v.pausedReason ?? 'Paused'} — tap the microphone to resume',
    VoiceState.ended => 'Voice delivery ended',
    VoiceState.error => 'Voice paused',
    VoiceState.idle => 'Tap the microphone to start',
  };
}

class VoiceScreen extends StatefulWidget {
  const VoiceScreen({super.key, required this.projectId});
  final String projectId;
  @override
  State<VoiceScreen> createState() => _VoiceScreenState();
}

class _VoiceScreenState extends State<VoiceScreen> with WidgetsBindingObserver, TickerProviderStateMixin {
  late final _delivery = deliveryLoader(widget.projectId);
  late final _wf = workflowLoader(widget.projectId);
  LiveClient? _client;
  DeliveryVoice? _runner;
  VoiceSnapshot _v = const VoiceSnapshot();
  bool _typing = false;
  final _draft = TextEditingController();
  // Handoff: the orb settles back while the next agent connects; barge-in or Stop: a quick dip.
  late final _orbScale = AnimationController(vsync: this, value: 1, lowerBound: 0.8, upperBound: 1.1);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _draft.addListener(() => setState(() {}));
    // The user opened voice mode on purpose: start talking right away.
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _runner?.stop();
    _client?.dispose();
    _delivery.dispose();
    _wf.dispose();
    _orbScale.dispose();
    _draft.dispose();
    super.dispose();
  }

  // The mic never runs in the background: leaving the app pauses; coming back resumes (or reconnects).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _client;
    if (c == null) return;
    if (state == AppLifecycleState.paused) {
      c.pause('Paused while Ampera is in the background');
    } else if (state == AppLifecycleState.resumed && (c.snapshot.pausedReason?.contains('background') ?? false)) {
      c.resume();
    }
  }

  void _start() {
    _runner?.stop();
    _client?.dispose();
    final c = LiveClient(
      projectId: widget.projectId,
      channel: 'intake',
      audio: DeviceAudio(),
      onChange: _onSnapshot,
      onMessages: refreshAll,
      onAction: refreshAll,
      onBargeIn: () {
        HapticFeedback.lightImpact();
        _dip();
      },
    );
    _client = c;
    _runner = DeliveryVoice(projectId: widget.projectId, client: c, onDelivery: (d) {
      _delivery.data = d;
      if (mounted) setState(() {});
    })
      ..start();
  }

  void _onSnapshot(VoiceSnapshot s) {
    final was = _v;
    if (!mounted) return;
    setState(() => _v = s);
    if (s.switching != was.switching) {
      if (s.switching) HapticFeedback.lightImpact();
      _springOrb(s.switching ? 0.86 : 1);
    }
    if (was.state == s.state) return;
    if (was.state == VoiceState.connecting && s.state == VoiceState.listening) {
      HapticFeedback.mediumImpact();
    } else if (s.state == VoiceState.speaking) {
      HapticFeedback.lightImpact();
    } else if (s.state == VoiceState.ended) {
      HapticFeedback.mediumImpact();
    } else if (s.state == VoiceState.error) {
      HapticFeedback.heavyImpact();
    }
  }

  bool get _reduced => MediaQuery.disableAnimationsOf(context);

  void _springOrb(double to) {
    if (_reduced) return;
    _orbScale.animateWith(SpringSimulation(const SpringDescription(mass: 1, stiffness: 300, damping: 20), _orbScale.value, to, 0));
  }

  Future<void> _dip() async {
    if (_reduced) return;
    await _orbScale.animateTo(0.92, duration: const Duration(milliseconds: 90), curve: Curves.easeOut);
    _springOrb(1);
  }

  @override
  Widget build(BuildContext context) {
    final v = _v;
    final started = !{VoiceState.idle, VoiceState.ended, VoiceState.error}.contains(v.state);
    final channel = started ? v.channel : activeChannel(_delivery.data);
    final agent = agents[channel]!;
    final tint = voiceAgent[channel]!.tint;
    final live = _live.contains(v.state);
    final connecting = v.state == VoiceState.connecting;
    final paused = v.state == VoiceState.paused;
    final speaking = v.state == VoiceState.speaking;
    final c = _client;
    final line = deliveryLine(_delivery.data);
    final width = MediaQuery.sizeOf(context).width;

    void toThread() => push(context, ChatScreen(projectId: widget.projectId, channel: channel));
    void onMic() {
      if (paused) {
        c?.resume();
      } else if (live) {
        c?.setMuted(!v.muted);
      } else if (!connecting) {
        _start();
      }
    }

    void sendTyped() {
      final text = _draft.text.trim();
      if (text.isEmpty) return;
      c?.type(text);
      _draft.clear();
    }

    final micLabel = paused
        ? 'Resume voice delivery'
        : live
            ? (v.muted ? 'Turn microphone on' : 'Turn microphone off')
            : connecting
                ? 'Connecting'
                : 'Start voice delivery';

    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          SizedBox(
            height: 52,
            child: Row(children: [
              IconButton(tooltip: 'Close voice mode', icon: const Icon(Icons.close, color: C.text), onPressed: () => Navigator.pop(context)),
              Expanded(child: Text('Delivery voice', style: T.label, textAlign: TextAlign.center)),
              const SizedBox(width: 48),
            ]),
          ),
          ListenableBuilder(
            listenable: Listenable.merge([_delivery, _wf]),
            builder: (_, _) => AgentRow(active: channel, speaking: speaking, delivery: _delivery.data, stages: _wf.data),
          ),
          Expanded(
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Semantics(
                button: true,
                enabled: speaking,
                label: 'Stop ${agent.name} speaking',
                hint: 'Silences the agent without ending voice mode',
                child: GestureDetector(
                  onTap: speaking
                      ? () {
                          c?.stopSpeaking();
                          _dip();
                        }
                      : null,
                  child: ScaleTransition(
                    scale: _orbScale,
                    child: VoiceOrb(state: v.state, levels: c?.levels, size: math.min(width * 0.6, 260), tint: tint),
                  ),
                ),
              ),
              SizedBox(height: sp(3)),
              Semantics(
                liveRegion: true,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: sp(6)),
                  child: Column(children: gap([
                    Eyebrow(voiceLine(v, agent.name)),
                    if (line.isNotEmpty) Text(line, style: T.body.copyWith(fontSize: 14, height: 20 / 14), textAlign: TextAlign.center),
                    if (v.notice != null) Text(v.notice!, style: T.label.copyWith(color: C.warning), textAlign: TextAlign.center),
                  ], sp(1))),
                ),
              ),
            ]),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 168),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: sp(6)),
              child: Center(child: _captions(v, agent.name, tint, toThread)),
            ),
          ),
          if (_typing)
            Padding(
              padding: EdgeInsets.fromLTRB(sp(4), sp(2), sp(4), 0),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _draft,
                    autofocus: true,
                    enabled: live,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => sendTyped(),
                    style: T.body,
                    decoration: InputDecoration(
                      hintText: 'Message ${agent.name}',
                      contentPadding: EdgeInsets.symmetric(horizontal: sp(4)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(40), borderSide: const BorderSide(color: C.borderInput)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(40), borderSide: const BorderSide(color: C.primary, width: 2)),
                      disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(40), borderSide: const BorderSide(color: C.border)),
                    ),
                  ),
                ),
                SizedBox(width: sp(2)),
                IconButton.filled(
                  tooltip: 'Send',
                  style: IconButton.styleFrom(backgroundColor: C.primary, fixedSize: const Size(44, 44)),
                  onPressed: live && _draft.text.trim().isNotEmpty ? sendTyped : null,
                  icon: const Icon(Icons.arrow_upward, color: C.primaryFg),
                ),
              ]),
            ),
          Padding(
            padding: EdgeInsets.only(top: sp(4), bottom: sp(4)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
              _SideButton(
                label: 'Type',
                tooltip: _typing ? 'Hide keyboard input' : 'Type instead',
                icon: const Icon(Icons.keyboard_outlined, color: C.text),
                onPressed: live ? () => setState(() => _typing = !_typing) : null,
              ),
              Semantics(
                button: true,
                label: micLabel,
                selected: live && !v.muted,
                excludeSemantics: true,
                child: Material(
                  color: live && v.muted ? C.primarySubtle : C.primary,
                  shape: CircleBorder(side: live && v.muted ? const BorderSide(color: C.primary, width: 2) : BorderSide.none),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: connecting ? null : onMic,
                    child: SizedBox(
                      width: 80,
                      height: 80,
                      child: Center(
                        child: connecting
                            ? const CircularProgressIndicator(color: C.primaryFg)
                            : Icon(
                                paused ? Icons.play_arrow : (live && v.muted ? Icons.mic_off : Icons.mic),
                                size: 32,
                                color: live && v.muted ? C.primary : C.primaryFg,
                              ),
                      ),
                    ),
                  ),
                ),
              ),
              _SideButton(
                label: 'End',
                tooltip: 'End voice delivery',
                icon: Icon(Icons.call_end, color: started ? C.danger : C.textMuted),
                onPressed: started ? () => _runner?.stop() : null,
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _captions(VoiceSnapshot v, String name, Color tint, VoidCallback toThread) {
    if (v.error != null) {
      final kind = v.error!.kind;
      return Semantics(
        liveRegion: true,
        child: Column(mainAxisSize: MainAxisSize.min, children: gap([
          Text(v.error!.message, style: T.body, textAlign: TextAlign.center),
          Wrap(alignment: WrapAlignment.center, spacing: sp(3), runSpacing: sp(3), children: [
            if (kind == VoiceErrorKind.mic || kind == VoiceErrorKind.network || kind == VoiceErrorKind.session)
              Btn('Try again', onPressed: _start),
            Btn('Type instead', variant: BtnVariant.secondary, onPressed: toThread),
          ]),
        ], sp(4))),
      );
    }
    if (v.confirming) {
      return Semantics(
        liveRegion: true,
        child: AnimatedScale(
          scale: 1,
          duration: const Duration(milliseconds: 200),
          child: Panel(
            padding: EdgeInsets.all(sp(4)),
            borderColor: C.border,
            child: Column(children: gap([
              Text('Say "confirm" or "cancel"', style: T.label, textAlign: TextAlign.center),
              Wrap(alignment: WrapAlignment.center, spacing: sp(3), children: [
                Btn('Confirm', onPressed: () => _client?.confirm(true)),
                Btn('Cancel', variant: BtnVariant.secondary, onPressed: () => _client?.confirm(false)),
              ]),
            ], sp(3))),
          ),
        ),
      );
    }
    if (v.userText.isNotEmpty || v.agentText.isNotEmpty) {
      return Semantics(
        button: true,
        hint: 'Opens the full conversation',
        child: InkWell(
          onTap: toThread,
          child: SizedBox(
            width: double.infinity,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: gap([
              if (v.userText.isNotEmpty)
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Eyebrow('You'),
                  Text(_tail(v.userText, 120), style: T.muted),
                ]),
              if (v.agentText.isNotEmpty)
                Semantics(
                  liveRegion: true,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Eyebrow(name, color: tint),
                    Text(_tail(v.agentText),
                        style: T.body.copyWith(fontSize: 24, height: 32 / 24, fontWeight: FontWeight.w300, letterSpacing: -0.3)),
                  ]),
                ),
            ], sp(3))),
          ),
        ),
      );
    }
    return Text(
      v.state == VoiceState.ended
          ? 'Tap the microphone to talk again.'
          : 'Ask "what\'s happening?", answer questions, or say "approve" when a draft is ready.',
      style: T.muted,
      textAlign: TextAlign.center,
    );
  }
}

class _SideButton extends StatelessWidget {
  const _SideButton({required this.label, required this.tooltip, required this.icon, required this.onPressed});
  final String label;
  final String tooltip;
  final Widget icon;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onPressed == null ? 0.4 : 1,
        child: SizedBox(
          width: 72,
          child: Column(children: [
            IconButton.outlined(
              tooltip: tooltip,
              style: IconButton.styleFrom(
                fixedSize: const Size(56, 56),
                backgroundColor: C.surface,
                side: const BorderSide(color: C.borderStrong),
              ),
              onPressed: onPressed,
              icon: icon,
            ),
            SizedBox(height: sp(1)),
            ExcludeSemantics(child: Text(label, style: T.caption)),
          ]),
        ),
      );
}

enum AgentStatus { done, active, waiting, idle, off }

const _waiting = {'WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT', 'NEEDS_REVISION'};
const _off = {'UNAVAILABLE', 'NOT_PLANNED'};

AgentStatus agentStatus(String ch, String active, Map<String, dynamic>? delivery, List<Map<String, dynamic>>? stages) {
  if (ch == active) return AgentStatus.active;
  if (ch == 'intake') {
    if ((delivery?['pending'] as Map?)?['kind'] == 'intake_questions') return AgentStatus.waiting;
    return delivery?['plan'] != null ? AgentStatus.done : AgentStatus.idle;
  }
  final s = stages?.where((x) => x['stage'] == ch).firstOrNull;
  if (s == null) return AgentStatus.idle;
  if (s['status'] == 'APPROVED') return AgentStatus.done;
  if (_waiting.contains(s['status'])) return AgentStatus.waiting;
  return _off.contains(s['status']) ? AgentStatus.off : AgentStatus.idle;
}

const _statusWord = {
  AgentStatus.done: 'done',
  AgentStatus.active: 'active',
  AgentStatus.waiting: 'waiting for you',
  AgentStatus.idle: 'not started',
  AgentStatus.off: 'not in this plan',
};

/// The six agents in delivery order; the one talking wears a ring that pulses while it speaks.
class AgentRow extends StatelessWidget {
  const AgentRow({super.key, required this.active, required this.speaking, this.delivery, this.stages});
  final String active;
  final bool speaking;
  final Map<String, dynamic>? delivery;
  final List<Map<String, dynamic>>? stages;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(children: [
          for (final ch in channels)
            Expanded(child: _Avatar(ch: ch, status: agentStatus(ch, active, delivery, stages), speaking: speaking && ch == active)),
        ]),
      );
}

class _Avatar extends StatefulWidget {
  const _Avatar({required this.ch, required this.status, required this.speaking});
  final String ch;
  final AgentStatus status;
  final bool speaking;
  @override
  State<_Avatar> createState() => _AvatarState();
}

class _AvatarState extends State<_Avatar> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));

  @override
  void didUpdateWidget(_Avatar old) {
    super.didUpdateWidget(old);
    _syncPulse();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncPulse();
  }

  void _syncPulse() {
    if (widget.speaking && !MediaQuery.disableAnimationsOf(context)) {
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final meta = voiceAgent[widget.ch]!;
    final active = widget.status == AgentStatus.active;
    final waiting = widget.status == AgentStatus.waiting;
    const snappy = Duration(milliseconds: 220);
    return Semantics(
      label: '${agents[widget.ch]!.name}, ${widget.speaking ? 'speaking' : _statusWord[widget.status]}',
      excludeSemantics: true,
      child: Opacity(
        opacity: widget.status == AgentStatus.off ? 0.4 : 1,
        child: Column(children: [
          SizedBox(
            width: 52,
            height: 52,
            child: Stack(alignment: Alignment.center, children: [
              if (active)
                AnimatedBuilder(
                  animation: _pulse,
                  builder: (_, _) => Transform.scale(
                    scale: 1 + _pulse.value * 0.1,
                    child: Opacity(
                      opacity: 1 - _pulse.value * 0.6,
                      child: Container(
                        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: meta.tint, width: 2)),
                      ),
                    ),
                  ),
                ),
              AnimatedScale(
                scale: active ? 1.08 : 1,
                duration: snappy,
                curve: Curves.easeOutBack,
                child: AnimatedContainer(
                  duration: snappy,
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: active ? meta.tint : (waiting ? C.warningSubtle : C.surfaceMuted),
                    border: waiting ? Border.all(color: C.warning) : null,
                  ),
                  child: Icon(meta.icon, size: 20, color: active ? C.primaryFg : (waiting ? C.warning : C.textMuted)),
                ),
              ),
              if (widget.status == AgentStatus.done)
                Positioned(
                  right: 4,
                  bottom: 4,
                  child: Container(
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      color: C.success,
                      shape: BoxShape.circle,
                      border: Border.all(color: C.bg, width: 2),
                    ),
                    child: const Icon(Icons.check, size: 9, color: C.primaryFg),
                  ),
                ),
            ]),
          ),
          SizedBox(height: sp(1)),
          Text(meta.short,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: T.caption.copyWith(fontSize: 12, height: 16 / 12, color: active ? C.text : C.textMuted)),
        ]),
      ),
    );
  }
}

/// Animated blob that follows the voice, tinted to the speaking agent; a static ring under reduced motion.
class VoiceOrb extends StatefulWidget {
  const VoiceOrb({super.key, required this.state, required this.levels, required this.size, required this.tint});
  final VoiceState state;
  final ({Level mic, Level out})? levels;
  final double size;
  final Color tint;
  @override
  State<VoiceOrb> createState() => _VoiceOrbState();
}

class _VoiceOrbState extends State<VoiceOrb> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker(_tick);
  final _frame = ValueNotifier<int>(0);
  Duration _last = Duration.zero;
  double _t = 0;
  double _amp = 0;
  Color _core = C.primary;

  static const _animated = {VoiceState.connecting, VoiceState.listening, VoiceState.thinking, VoiceState.speaking};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(VoiceOrb old) {
    super.didUpdateWidget(old);
    _sync();
  }

  // Rendered only while a session is live; otherwise the last frame stays on screen.
  void _sync() {
    final run = _animated.contains(widget.state) && !MediaQuery.disableAnimationsOf(context);
    if (run && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (!run && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _tick(Duration elapsed) {
    final dt = _last == Duration.zero ? 0.016 : (elapsed - _last).inMicroseconds / 1e6;
    _last = elapsed;
    final l = widget.levels;
    final s = widget.state;
    final target = switch (s) {
      VoiceState.listening => l?.mic.value ?? 0,
      VoiceState.speaking => 0.25 + (l?.out.value ?? 0),
      VoiceState.thinking => 0.12 + 0.08 * math.sin(_t * 2),
      _ => 0.05,
    };
    // Ease toward the target so per-chunk loudness jumps read as motion, not flicker.
    _amp += (math.min(target, 1) - _amp) * math.min(1, dt * 8);
    _t += dt * (s == VoiceState.thinking ? 0.5 : 1);
    // Handoff: the core eases to the new agent's colour instead of snapping.
    _core = Color.lerp(_core, widget.tint, math.min(1, dt * 4))!;
    _frame.value++;
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.disableAnimationsOf(context);
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: widget.size,
        child: reduced
            ? CustomPaint(painter: _RingPainter(state: widget.state, tint: widget.tint))
            : CustomPaint(painter: _BlobPainter(this, repaint: _frame)),
      ),
    );
  }
}

class _BlobPainter extends CustomPainter {
  _BlobPainter(this.orb, {required Listenable repaint}) : super(repaint: repaint);
  final _VoiceOrbState orb;

  double _wave(double a, double t, double f, double phase) =>
      math.sin(a * f + t * 1.3 + phase) * math.sin(a * (f - 1) - t * 1.1) * math.sin(a * 2 + t * 0.9 + phase);

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width * 0.36;
    final amp = orb._amp;
    final t = orb._t;
    final path = Path();
    const n = 96;
    for (var i = 0; i <= n; i++) {
      final a = i / n * 2 * math.pi;
      final d = _wave(a, t, 3, 0) * (0.03 + amp * 0.24) + _wave(a, t, 5, 1.7) * amp * 0.06;
      final p = c + Offset(math.cos(a), math.sin(a)) * r * (1 + d);
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    path.close();
    final rect = Rect.fromCircle(center: c, radius: r * 1.3);
    canvas.drawPath(
      path,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.25, -0.3),
          colors: [Color.lerp(orb._core, Colors.white, 0.25)!, orb._core, C.lavender],
          stops: const [0, 0.55, 1],
        ).createShader(rect),
    );
    // Soft halo grows with loudness.
    canvas.drawCircle(c, r * (1.12 + amp * 0.25), Paint()..color = orb._core.withValues(alpha: 0.08 + amp * 0.1));
  }

  @override
  bool shouldRepaint(_BlobPainter old) => false;
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.state, required this.tint});
  final VoiceState state;
  final Color tint;
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 * 0.82;
    final stroke = state == VoiceState.error
        ? C.danger
        : {VoiceState.connecting, VoiceState.listening, VoiceState.thinking, VoiceState.speaking}.contains(state)
            ? tint
            : C.borderInput;
    canvas
      ..drawCircle(c, r, Paint()..color = C.primarySubtle)
      ..drawCircle(c, r, Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6)
      ..drawCircle(c, size.width / 4, Paint()..color = stroke.withValues(alpha: 0.18));
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.state != state || old.tint != tint;
}
