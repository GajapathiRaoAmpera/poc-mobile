/// Text chat with the Orchestrator (`intake`) or a stage agent; the empty composer's button opens Voice mode.
library;

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';
import 'project.dart';
import 'voice.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.projectId, required this.channel});
  final String projectId;
  final String channel;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final String _channel = agents.containsKey(widget.channel) ? widget.channel : 'intake';
  late final _delivery = deliveryLoader(widget.projectId);
  late final _wf = workflowLoader(widget.projectId);
  late final _messages = Loader(
    () async => maps(await api('/projects/${widget.projectId}/conversations/$_channel/messages')),
    poll: () => _working,
  );
  final _draft = TextEditingController();
  bool _sending = false;
  Object? _sendError;

  bool get _working {
    if (_channel == 'intake') return _delivery.data?['status'] == 'RUNNING';
    final s = _wf.data?.where((s) => s['stage'] == _channel).firstOrNull;
    return const {'QUEUED', 'RUNNING'}.contains(s?['status']);
  }

  @override
  void initState() {
    super.initState();
    // Poll for the agent's reply while it works.
    _delivery.addListener(_messages.schedule);
    _wf.addListener(_messages.schedule);
    _draft.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _delivery.dispose();
    _wf.dispose();
    _messages.dispose();
    _draft.dispose();
    super.dispose();
  }

  Future<void> _submit([String? text]) async {
    final t = (text ?? _draft.text).trim();
    if (t.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      final out = (await api('/projects/${widget.projectId}/conversations/$_channel/messages', method: 'POST', json: {'text': t}))
          as Map<String, dynamic>;
      _messages.data = [...?_messages.data, out['message'] as Map<String, dynamic>];
      _draft.clear();
      refreshAll();
    } catch (e) {
      _sendError = e;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final agent = agents[_channel]!;
    return Scaffold(
      appBar: AppBar(title: Text(agent.name)),
      body: ListenableBuilder(
        listenable: Listenable.merge([_messages, _delivery, _wf]),
        builder: (context, _) {
          final m = _messages;
          final msgs = m.data ?? const [];
          return Column(children: [
            Expanded(
              child: m.loading
                  ? const SkeletonList(rows: 3)
                  : m.error != null && m.data == null
                      ? ErrorState(error: m.error, onRetry: m.load)
                      // Reversed so the thread starts from the bottom and stays pinned to the newest message.
                      : ListView(
                          reverse: true,
                          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: EdgeInsets.symmetric(horizontal: sp(4), vertical: sp(3)),
                          children: [
                            if (_working)
                              Semantics(
                                liveRegion: true,
                                child: Padding(
                                  padding: EdgeInsets.symmetric(vertical: sp(3)),
                                  child: Row(children: [
                                    const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                                    SizedBox(width: sp(2)),
                                    Text('${agent.name} is working…', style: T.caption),
                                  ]),
                                ),
                              ),
                            for (final msg in msgs.reversed) MessageBubble(msg, key: ValueKey(msg['id'])),
                            if (msgs.isEmpty) EmptyState(icon: Icons.forum_outlined, title: agent.name, body: agent.empty),
                            Padding(
                              padding: EdgeInsets.only(bottom: sp(3)),
                              child: Text(agent.hint, style: T.caption, textAlign: TextAlign.center),
                            ),
                          ],
                        ),
            ),
            _composer(agent, msgs.isEmpty && !m.loading),
          ]);
        },
      ),
    );
  }

  Widget _composer(AgentCopy agent, bool empty) => Container(
        decoration: const BoxDecoration(color: C.surface, border: Border(top: BorderSide(color: C.border, width: 0.5))),
        padding: EdgeInsets.fromLTRB(sp(3), sp(3), sp(3), sp(3)),
        child: SafeArea(
          top: false,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: gap([
            if (_sendError != null) Notice(errorMessage(_sendError)),
            if (empty && agent.suggestions.isNotEmpty)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: gap([
                  for (final s in agent.suggestions)
                    ActionChip(
                      label: Text(s, style: T.caption.copyWith(color: C.text)),
                      backgroundColor: C.bg,
                      side: const BorderSide(color: C.borderStrong),
                      shape: const StadiumBorder(),
                      onPressed: () => _submit(s),
                    ),
                ], sp(2))),
              ),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: TextField(
                  controller: _draft,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 4000,
                  style: T.body,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Message ${agent.name}',
                    counterText: '',
                    contentPadding: EdgeInsets.symmetric(horizontal: sp(4), vertical: 11),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: C.borderInput)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: C.primary, width: 2)),
                  ),
                ),
              ),
              SizedBox(width: sp(2)),
              if (_draft.text.trim().isNotEmpty || _sending)
                _RoundButton(
                  tooltip: 'Send',
                  onPressed: _sending ? null : _submit,
                  child: _sending
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: C.primaryFg))
                      : const Icon(Icons.arrow_upward, color: C.primaryFg, size: 20),
                )
              else
                // Empty composer: the same spot opens voice mode, like a phone keyboard's mic.
                _RoundButton(
                  tooltip: 'Voice mode',
                  onPressed: () => push(context, VoiceScreen(projectId: widget.projectId), fullscreenDialog: true),
                  child: const Icon(Icons.graphic_eq, color: C.primaryFg, size: 20),
                ),
            ]),
          ], sp(2))),
        ),
      );
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.tooltip, required this.onPressed, required this.child});
  final String tooltip;
  final VoidCallback? onPressed;
  final Widget child;
  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: onPressed == null ? C.primary.withValues(alpha: 0.4) : C.primary,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox(width: 44, height: 44, child: Center(child: child)),
          ),
        ),
      );
}

class MessageBubble extends StatelessWidget {
  const MessageBubble(this.message, {super.key});
  final Map<String, dynamic> message;
  @override
  Widget build(BuildContext context) {
    final text = cleanMessage('${message['text'] ?? ''}');
    final role = message['role'];
    if (role == 'system') {
      return Center(
        child: Container(
          margin: EdgeInsets.symmetric(vertical: sp(2)),
          padding: EdgeInsets.symmetric(horizontal: sp(3), vertical: sp(1.5)),
          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.92),
          decoration: BoxDecoration(color: C.surfaceMuted, borderRadius: BorderRadius.circular(40)),
          child: Text(text, style: T.caption, textAlign: TextAlign.center),
        ),
      );
    }
    final mine = role == 'user';
    final agent = message['agent'] as String?;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.86),
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: sp(1.5)),
          child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: gap([
            if (!mine && agent != null) Eyebrow(agentLabel[agent] ?? agent),
            Container(
              padding: EdgeInsets.symmetric(horizontal: sp(4), vertical: sp(3)),
              decoration: BoxDecoration(
                color: mine ? C.primary : C.surface,
                border: mine ? null : Border.all(color: C.borderStrong, width: 0.5),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(mine ? 18 : 6),
                  bottomRight: Radius.circular(mine ? 6 : 18),
                ),
              ),
              child: SelectableText(text, style: mine ? T.body.copyWith(color: C.primaryFg) : T.body),
            ),
            Text(relativeTime('${message['created_at']}'), style: T.caption.copyWith(fontSize: 11)),
          ], sp(1))),
        ),
      ),
    );
  }
}
