/// Runs the whole delivery by voice: one live session at a time, voiced by whichever agent the
/// delivery is on. Polls the delivery and all six threads, hands the session over when the active
/// agent changes, and narrates other agents' news as "[UPDATE]" text turns.
library;

import 'dart:async';

import '../core/api.dart';
import '../core/format.dart';
import 'live_client.dart';

/// Which agent should be talking: the stage the delivery waits on, the newest working stage, else the Orchestrator.
String activeChannel(Map<String, dynamic>? d, [String? newest]) {
  final p = d?['pending'] as Map<String, dynamic>?;
  final stage = p?['stage'] ?? (p?['payload'] as Map?)?['stage'];
  if (stage is String && channels.contains(stage)) return stage;
  if (d?['status'] == 'RUNNING' && newest != null) return newest;
  return 'intake';
}

/// Questions and approval requests matter most: they're re-offered if cut off and come first in a recap.
final _important = RegExp(r'\?|approv|review|confirm|decide|answer', caseSensitive: false);
String _short(String s, [int n = 160]) => s.length > n ? '${s.substring(0, n).replaceFirst(RegExp(r'\s\S*$'), '')}…' : s;
final _updateLine = RegExp(r'^\[UPDATE\] (?!\(re-offer\))([^:]+): (.*)$', dotAll: true);

typedef _Update = ({String label, String text, bool important});

class DeliveryVoice {
  DeliveryVoice({required this.projectId, required this.client, this.onDelivery, this.pollMs = 3000}) : _want = client.channel {
    client.onIdle = act;
    client.onTextCut = _reoffer;
    client.onResume = _recap;
  }

  final String projectId;
  final LiveClient client;
  final void Function(Map<String, dynamic> d)? onDelivery;
  final int pollMs;

  final _lastSeq = <String, int>{};
  final _lastNarrated = <String, String>{};
  ({String channel, String at})? _newest;
  List<_Update> _queue = [];
  final _reoffered = <String>{};
  String _want;
  Map<String, dynamic>? _delivery;
  Timer? _timer;
  bool _ticking = false;
  bool _stopped = false;

  Future<void> start() async {
    _stopped = false;
    // Baseline: history isn't narrated, only what happens from now on.
    await Future.wait([_fetchDelivery(), for (final ch in channels) _fetchMessages(ch, true)]);
    if (_stopped) return;
    _want = activeChannel(_delivery, _newest?.channel);
    client.setChannel(_want);
    client.start();
    _timer = Timer.periodic(Duration(milliseconds: pollMs), (_) => tick());
  }

  void stop() {
    _stopped = true;
    _timer?.cancel();
    _timer = null;
    client.stop();
  }

  Future<void> tick() async {
    if (_ticking || _stopped) return;
    _ticking = true;
    try {
      final fresh = <Map<String, dynamic>>[];
      await Future.wait([
        _fetchDelivery(),
        for (final ch in channels) _fetchMessages(ch, false).then(fresh.addAll),
      ]);
      _narrate(fresh);
      _want = activeChannel(_delivery, _newest?.channel);
      act();
    } finally {
      _ticking = false;
    }
  }

  /// Hand over or send queued news, but never over the agent's voice or a running tool.
  void act() {
    final c = client;
    if (_stopped || c.busy || c.held) return;
    if (_want != c.channel) {
      final from = agents[c.channel]!.name;
      final latest = _queue.isNotEmpty
          ? _queue.map((u) => '${u.label}: ${u.text}').join(' ')
          : cleanMessage('${_delivery?['message'] ?? ''}');
      _queue = [];
      c.switchChannel(_want, '[HANDOFF] Previous agent: $from.${latest.isNotEmpty ? ' Latest update: $latest' : ''}');
      return;
    }
    if (_queue.isEmpty) return;
    c.sendText(_queue.map((u) => '[UPDATE] ${u.label}: ${u.text}').join('\n'));
    _queue = [];
  }

  /// Back from mute or a pause: one recap, questions and approvals first, instead of every update.
  void _recap() {
    if (_want != client.channel) return act();
    if (_queue.isEmpty) return;
    final items = [..._queue.where((u) => u.important), ..._queue.where((u) => !u.important)];
    _queue = [];
    client.sendText('[RESUMED] ${items.map((u) => '${u.label}: ${u.text}').join(' | ')}');
  }

  /// An update with a question or approval request was cut off: offer it again once, after the user's turn.
  void _reoffer(String sent) {
    for (final line in sent.split('\n')) {
      final m = _updateLine.firstMatch(line);
      if (m == null || !_important.hasMatch(m[2]!) || _reoffered.contains(line)) continue;
      _reoffered.add(line);
      _queue.add((label: '(re-offer) ${m[1]}', text: _short(m[2]!), important: true));
    }
  }

  void _narrate(List<Map<String, dynamic>> msgs) {
    bool progress(Map<String, dynamic> m) => (m['refs'] as Map?)?['progress'] == true;
    // Progress notices repeat ("Drafting…", "Validating…"): only the latest per agent is worth saying.
    final lastProgress = <String, Map<String, dynamic>>{};
    for (final m in msgs) {
      if (m['role'] == 'system' && progress(m)) lastProgress['${m['channel']}'] = m;
    }
    msgs.sort((a, b) => '${a['created_at']}'.compareTo('${b['created_at']}'));
    for (final m in msgs) {
      final ch = '${m['channel']}';
      if (m['role'] == 'user' || client.isOwn(ch, m['seq'] as int)) continue;
      if (progress(m) && !identical(lastProgress[ch], m)) continue;
      final text = cleanMessage('${m['text'] ?? ''}');
      if (text.isEmpty || _lastNarrated[ch] == text) continue;
      _lastNarrated[ch] = text;
      final label = agentLabel[m['agent']] ?? agents[ch]?.name ?? ch;
      _queue.add((label: label, text: text, important: _important.hasMatch(text)));
    }
  }

  Future<void> _fetchDelivery() async {
    try {
      _delivery = (await api('/projects/$projectId/delivery')) as Map<String, dynamic>;
      onDelivery?.call(_delivery!);
    } catch (_) {
      // Keep the last known state; the next poll retries.
    }
  }

  Future<List<Map<String, dynamic>>> _fetchMessages(String ch, bool baseline) async {
    final after = _lastSeq[ch];
    // A failed baseline is retried as a baseline, so old history is never read out.
    if (after == null) {
      baseline = true;
    } else if (client.isAsking(ch)) {
      // Its reply goes back as the tool result; reading it here too would say it twice.
      return [];
    }
    final List<Map<String, dynamic>> msgs;
    try {
      msgs = maps(await api('/projects/$projectId/conversations/$ch/messages${after == null ? '' : '?after=$after'}'));
    } catch (_) {
      return [];
    }
    for (final m in msgs) {
      final seq = m['seq'] as int;
      if (seq > (_lastSeq[ch] ?? -1)) _lastSeq[ch] = seq;
      final at = '${m['created_at']}';
      if (m['role'] != 'user' && (_newest == null || at.compareTo(_newest!.at) > 0)) _newest = (channel: ch, at: at);
    }
    _lastSeq[ch] ??= 0;
    return baseline ? [] : msgs.where((m) => (m['seq'] as int) > (after ?? -1)).toList();
  }
}
