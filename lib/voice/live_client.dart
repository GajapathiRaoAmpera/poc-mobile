/// Voice front-end for the delivery. Gemini Live only hears and speaks; every request goes to the
/// project's agents through the conversations API via the `send_to_agent` tool, and the agent's
/// reply goes back to Gemini as the tool result to be read out. Delivery tools (status, approve,
/// request changes, resume, cancel) run here too, behind a spoken-"confirm" guard.
library;

import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../core/api.dart';
import '../core/format.dart';

// Same endpoint and auth as @google/genai for auth_tokens/ keys: the Constrained method, token in the
// access_token query param, v1alpha (the SDK's supported version for ephemeral tokens, and what
// poc-frontend uses). If v1alpha is refused, change it here.
const liveUrl =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const _micMime = 'audio/pcm;rate=16000';
const _micRate = 16000;

enum VoiceState { idle, connecting, listening, thinking, speaking, paused, error, ended }

enum VoiceErrorKind { mic, network, unavailable, quota, session }

enum SystemAudioEvent { interrupted, resumable, unplugged }

const _keep = Object();

class VoiceSnapshot {
  const VoiceSnapshot({
    this.state = VoiceState.idle,
    this.muted = false,
    this.userText = '',
    this.agentText = '',
    this.error,
    this.channel = 'intake',
    this.switching = false,
    this.confirming = false,
    this.notice,
    this.pausedReason,
  });
  final VoiceState state;
  final bool muted;

  /// What the user said this turn, then what was said back.
  final String userText;
  final String agentText;
  final ({VoiceErrorKind kind, String message})? error;

  /// The agent whose voice is live (changes on handoff).
  final String channel;

  /// Reconnecting with the next agent's voice.
  final bool switching;

  /// The agent just read an action back and asked the user to say "confirm".
  final bool confirming;

  /// Short-lived feedback line, e.g. "Cancelled approval".
  final String? notice;

  /// Why the session is paused (phone call, headphones, app in background).
  final String? pausedReason;

  VoiceSnapshot copyWith({
    VoiceState? state,
    bool? muted,
    String? userText,
    String? agentText,
    Object? error = _keep,
    String? channel,
    bool? switching,
    bool? confirming,
    Object? notice = _keep,
    Object? pausedReason = _keep,
  }) =>
      VoiceSnapshot(
        state: state ?? this.state,
        muted: muted ?? this.muted,
        userText: userText ?? this.userText,
        agentText: agentText ?? this.agentText,
        error: identical(error, _keep) ? this.error : error as ({VoiceErrorKind kind, String message})?,
        channel: channel ?? this.channel,
        switching: switching ?? this.switching,
        confirming: confirming ?? this.confirming,
        notice: identical(notice, _keep) ? this.notice : notice as String?,
        pausedReason: identical(pausedReason, _keep) ? this.pausedReason : pausedReason as String?,
      );
}

abstract class LiveSocket {
  void send(String data);
  void close();
}

typedef SocketFactory = LiveSocket Function(
  Uri url, {
  required void Function() onOpen,
  required void Function(Object? data) onMessage,
  required void Function() onClose,
});

class _WsSocket implements LiveSocket {
  _WsSocket(Uri url, {required void Function() onOpen, required void Function(Object? data) onMessage, required void Function() onClose}) {
    _ch = WebSocketChannel.connect(url);
    _ch.ready.then((_) => onOpen(), onError: (_) {});
    _ch.stream.listen(onMessage, onDone: onClose, onError: (_) {});
  }
  late final WebSocketChannel _ch;
  @override
  void send(String data) => _ch.sink.add(data);
  @override
  void close() => _ch.sink.close();
}

abstract class AudioIO {
  Future<bool> requestPermission();

  /// Streams 16 kHz mono PCM16 as base64 with a 0..1 loudness for each chunk.
  Future<void> startMic(void Function(String base64, double level) onChunk);
  void stopMic();

  /// Queues 24 kHz mono PCM16 (base64); returns its length and loudness.
  ({double seconds, double level}) play(String base64);

  /// Drops everything queued (barge-in).
  void flush();

  /// Playback volume 0..1 (ducking while the user may be interrupting).
  void setGain(double gain);

  /// Phone calls, audio focus loss, headphones unplugged. Returns an unsubscribe.
  void Function() watchSystem(void Function(SystemAudioEvent e) cb);
  void close();
}

final _confirm = RegExp(r'\bconfirm\b', caseSensitive: false);
// "don't confirm", "do not confirm", "no, don't confirm it" must never approve anything.
final _negated = RegExp(r"\b(?:don'?t|do not|not|never|no)\b\W+(?:\w+\W+){0,2}confirm\b", caseSensitive: false);
bool saidConfirm(String text) => _confirm.hasMatch(text) && !_negated.hasMatch(text);
final _agree = RegExp(r'\b(confirm|yes)\b', caseSensitive: false);
final _stop = RegExp(r'\b(stop|cancel|never ?mind)\b', caseSensitive: false);
const _notConfirmed =
    'Not done: the user has not said "confirm" since you read the action back. Read it back and ask them to say "confirm".';

/// Barge-in tuning: loud for this long while the agent talks ducks it; no `interrupted` by then restores it.
const barge = (floor: 0.06, echo: 0.6, holdMs: 150, duck: 0.15, falseAlarmMs: 600, bufferMs: 3000);

int _now() => DateTime.now().millisecondsSinceEpoch;
double _b64Ms(String b64) => (b64.length * 3 / 4 / 2 / _micRate) * 1000;

class _Ask {
  String? runId;
  bool cancelled = false;
}

class LiveClient {
  LiveClient({
    required this.projectId,
    required String channel,
    required this.audio,
    required this.onChange,
    this.onMessages,
    this.onAction,
    this.onBargeIn,
    SocketFactory? createSocket,
    this.pollMs = 1500,
    this.replyTimeoutMs = 180000,
  })  : _createSocket = createSocket ?? _WsSocket.new,
        _snap = VoiceSnapshot(channel: channel);

  final String projectId;
  final AudioIO audio;
  final void Function(VoiceSnapshot s) onChange;

  /// New user or agent messages exist: refetch the thread.
  final void Function()? onMessages;

  /// A delivery action ran (approve, request changes, resume, cancel): refetch delivery state.
  final void Function()? onAction;

  /// Local barge-in detected: the agent was ducked.
  final void Function()? onBargeIn;
  final SocketFactory _createSocket;
  final int pollMs;
  final int replyTimeoutMs;

  /// Read every frame by the orb; kept out of widget state on purpose.
  final levels = (mic: Level(), out: Level());
  VoiceSnapshot _snap;
  LiveSocket? _socket;
  bool _ready = false;
  bool _stopped = false;
  bool _micOn = false;
  int _pending = 0;
  int _playingUntil = 0;
  Timer? _playTimer;
  String? _lastSpeaker;
  bool _modelTurn = false;

  /// Tapped Stop: drop the rest of this model turn's audio.
  bool _discardTurn = false;

  /// Text to send as soon as the next session is set up (handoff greeting, early updates).
  List<String> _queuedText = [];

  /// The text turn the model is answering right now, so a cut-off update can be re-offered.
  String? _answering;

  /// Mic audio said while the next agent's session connects, flushed in order once it is up.
  List<String> _micBuffer = [];
  double _micBufferMs = 0;

  /// What the user said or typed since their last fresh turn; the "confirm" guard reads it.
  String _heard = '';
  bool _tapConfirmed = false;
  final _asking = <String>{};
  final _own = <String>{};
  _Ask? _ask;
  double _loudMs = 0;
  Timer? _ducked;
  Timer? _noticeTimer;
  int _expiresAt = 0;
  bool _needsReconnect = false;
  bool _resumeAfterSetup = false;
  void Function()? _unwatch;

  /// Called when the model finishes a turn with no tool pending: a good moment to send news.
  void Function()? onIdle;

  /// A text turn (an [UPDATE]) was cut off before the user heard it all.
  void Function(String text)? onTextCut;

  /// Unmuted or back from a pause: time to send what was missed.
  void Function()? onResume;

  VoiceSnapshot get snapshot => _snap;
  String get channel => _snap.channel;

  /// Model talking, audio still playing, or a tool in flight: hold handoffs and narration.
  bool get busy => _modelTurn || _pending > 0 || _now() < _playingUntil;

  /// Muted or paused: the user isn't listening live, so news waits for a single recap.
  bool get held => _snap.muted || _snap.state == VoiceState.paused;

  /// Picks the first agent before start(); use switchChannel() once live.
  void setChannel(String channel) => _set(_snap.copyWith(channel: channel));

  /// True while a send_to_agent on this channel waits for its reply (its reply must not be narrated).
  bool isAsking(String channel) => _asking.contains(channel);

  /// A message this client posted, or a reply it already read out.
  bool isOwn(String channel, int seq) => _own.contains('$channel:$seq');

  Future<void> start() async {
    _stopped = false;
    _ready = false;
    _pending = 0;
    _lastSpeaker = null;
    _set(VoiceSnapshot(channel: _snap.channel, state: VoiceState.connecting));
    _unwatch?.call();
    _unwatch = audio.watchSystem(_onSystem);

    bool granted;
    try {
      granted = await audio.requestPermission();
    } catch (_) {
      granted = false;
    }
    if (!granted) return _fail(VoiceErrorKind.mic, 'Ampera needs your microphone to hear you. Turn it on in Settings, then try again.');
    await _connect();
  }

  /// Hands the conversation to another agent: new token (new voice), then `intro` as its first turn.
  Future<void> switchChannel(String channel, String intro) async {
    if (_stopped) return;
    final old = _socket;
    _socket = null;
    _ready = false;
    old?.close();
    // The mic stays on: what the user says during the reconnect is buffered and sent to the new agent.
    _flushPlayback();
    _modelTurn = false;
    _answering = null;
    _lastSpeaker = null;
    _queuedText = [intro];
    _micBuffer = [];
    _micBufferMs = 0;
    _set(_snap.copyWith(channel: channel, switching: true, confirming: false, state: VoiceState.connecting));
    await _connect();
  }

  /// A text turn for the model (workflow news, handoffs, typed input). Queued until the session is ready.
  void sendText(String text) {
    if (!_ready) {
      _queuedText.add(text);
      return;
    }
    _answering = text;
    _send({
      'clientContent': {
        'turns': [
          {
            'role': 'user',
            'parts': [
              {'text': text}
            ]
          }
        ],
        'turnComplete': true,
      }
    });
  }

  /// The user typed instead of speaking: it counts as their own words, including "confirm".
  void type(String text) {
    _endUserTurn(text);
    _heard = text;
    _lastSpeaker = null;
    _set(_snap.copyWith(userText: text, agentText: ''));
    sendText(text);
  }

  /// Tapped Confirm or Cancel on the confirm card: the same flag a spoken "confirm" sets.
  void confirm(bool yes) {
    _tapConfirmed = yes;
    if (!yes) {
      _heard = '';
      _set(_snap.copyWith(confirming: false));
      _notify('Cancelled approval');
    }
    sendText(yes ? 'confirm' : 'cancel');
  }

  /// Tapped the orb while the agent talks: silence it now, keep the session.
  void stopSpeaking() {
    if (!_modelTurn && _now() >= _playingUntil) return;
    _discardTurn = _modelTurn;
    _cutOff();
  }

  /// Ends the session; captions stay so the last exchange is still readable.
  void stop() {
    if (_stopped) return;
    _stopped = true;
    _teardown();
    if (_snap.state != VoiceState.error) _set(_snap.copyWith(state: VoiceState.ended, pausedReason: null));
  }

  void dispose() {
    stop();
    _noticeTimer?.cancel();
    _unwatch?.call();
    _unwatch = null;
    audio.close();
  }

  void setMuted(bool muted) {
    if (muted == _snap.muted) return;
    // Closing the audio stream tells the server's voice detection the user's turn is over.
    if (muted && _ready) {
      _send({
        'realtimeInput': {'audioStreamEnd': true}
      });
    }
    levels.mic.value = 0;
    _set(_snap.copyWith(muted: muted));
    if (!muted && _ready) onResume?.call();
  }

  /// Phone call, background: release mic and speaker but keep the session for a quick return.
  void pause(String reason) {
    if (_stopped || _snap.state == VoiceState.paused || _snap.state == VoiceState.idle) return;
    audio.stopMic();
    _micOn = false;
    _flushPlayback();
    if (_modelTurn) _discardTurn = true;
    _set(_snap.copyWith(state: VoiceState.paused, pausedReason: reason));
  }

  Future<void> resume() async {
    if (_stopped || _snap.state != VoiceState.paused) return;
    _set(_snap.copyWith(pausedReason: null));
    // Session dropped or token window over while away: reconnect with a fresh token, recap after setup.
    if (_needsReconnect || _socket == null || _now() > _expiresAt) {
      _needsReconnect = false;
      final old = _socket;
      _socket = null;
      _ready = false;
      old?.close();
      _set(_snap.copyWith(state: VoiceState.connecting));
      _resumeAfterSetup = true;
      return _connect();
    }
    _set(_snap.copyWith(state: VoiceState.listening));
    await _ensureMic();
    _refresh();
    onResume?.call();
  }

  void _onSystem(SystemAudioEvent e) {
    switch (e) {
      case SystemAudioEvent.interrupted:
        pause("Paused for another app's audio");
      case SystemAudioEvent.unplugged:
        pause('Headphones disconnected');
      case SystemAudioEvent.resumable:
        if (_snap.pausedReason == "Paused for another app's audio") resume();
    }
  }

  Future<void> _connect() async {
    final Map<String, dynamic> session;
    try {
      session = (await api('/projects/$projectId/voice/session', method: 'POST', json: {'channel': _snap.channel}))
          as Map<String, dynamic>;
    } catch (err) {
      return _fail(_sessionErrorKind(err), errorMessage(err));
    }
    if (_stopped) return;
    final exp = DateTime.tryParse('${session['expires_at']}');
    _expiresAt = exp?.millisecondsSinceEpoch ?? _now() + 25 * 60000;
    final model = '${session['model']}';

    late final LiveSocket socket;
    socket = _createSocket(
      Uri.parse('$liveUrl?access_token=${Uri.encodeQueryComponent('${session['token']}')}'),
      // The token pins model, system prompt, tools and audio config server-side; these must agree with it.
      onOpen: () => _send({
        'setup': {
          'model': model.startsWith('models/') ? model : 'models/$model',
          'generationConfig': {
            'responseModalities': ['AUDIO']
          },
          'inputAudioTranscription': <String, dynamic>{},
          'outputAudioTranscription': <String, dynamic>{},
        }
      }),
      onMessage: _onMessage,
      onClose: () {
        if (!identical(_socket, socket) || _stopped) return;
        if (_snap.state == VoiceState.paused) {
          _needsReconnect = true;
          return;
        }
        if (!_ready) return _fail(VoiceErrorKind.session, "Couldn't start the voice session. Check your connection and try again.");
        stop();
      },
    );
    _socket = socket;
  }

  void _teardown() {
    _ready = false;
    final s = _socket;
    _socket = null;
    s?.close();
    audio.stopMic();
    _micOn = false;
    _flushPlayback();
    _modelTurn = false;
    _queuedText = [];
    _micBuffer = [];
    _ask?.cancelled = true;
  }

  void _fail(VoiceErrorKind kind, String message) {
    _stopped = true;
    _teardown();
    _set(_snap.copyWith(state: VoiceState.error, switching: false, error: (kind: kind, message: message)));
  }

  void _send(Map<String, dynamic> msg) => _socket?.send(jsonEncode(msg));

  void _set(VoiceSnapshot s) {
    _snap = s;
    onChange(s);
  }

  void _notify(String notice) {
    _noticeTimer?.cancel();
    _set(_snap.copyWith(notice: notice));
    _noticeTimer = Timer(const Duration(seconds: 3), () => _set(_snap.copyWith(notice: null)));
  }

  /// Live states follow what is actually happening: audio out beats agent work beats listening.
  void _refresh() {
    if (!_ready || _stopped || _snap.state == VoiceState.paused) return;
    final state = _now() < _playingUntil
        ? VoiceState.speaking
        : _pending > 0
            ? VoiceState.thinking
            : VoiceState.listening;
    if (state != _snap.state) _set(_snap.copyWith(state: state));
  }

  void _flushPlayback() {
    audio.flush();
    audio.setGain(1);
    _ducked?.cancel();
    _ducked = null;
    _loudMs = 0;
    _playingUntil = 0;
    levels.out.value = 0;
    _playTimer?.cancel();
    _playTimer = null;
  }

  /// The agent was cut off (by the user or a tap): stop audio, mark the caption, re-offer a cut update.
  void _cutOff() {
    _flushPlayback();
    _modelTurn = false;
    if (_snap.agentText.isNotEmpty && !_snap.agentText.endsWith('…')) {
      _set(_snap.copyWith(agentText: '${_snap.agentText.trimRight()}…'));
    }
    _lastSpeaker = null;
    final cut = _answering;
    _answering = null;
    if (cut != null) onTextCut?.call(cut);
    _refresh();
  }

  Future<void> _ensureMic() async {
    if (_micOn) return;
    _micOn = true;
    try {
      await audio.startMic(_onMic);
    } catch (_) {
      _micOn = false;
      _fail(VoiceErrorKind.mic, "The microphone couldn't start. Close other apps using it, then try again.");
    }
  }

  void _onMic(String b64, double lvl) {
    if (_snap.muted || _snap.state == VoiceState.paused) return;
    final ms = _b64Ms(b64);
    if (!_ready) {
      // Handoff reconnect: keep the newest ~3 s so the user can keep talking.
      if (!_snap.switching) return;
      _micBuffer.add(b64);
      _micBufferMs += ms;
      while (_micBufferMs > barge.bufferMs && _micBuffer.length > 1) {
        _micBufferMs -= _b64Ms(_micBuffer.removeAt(0));
      }
      return;
    }
    levels.mic.value = lvl;
    _sendAudio(b64);
    _detectBargeIn(lvl, ms);
  }

  void _sendAudio(String b64) => _send({
        'realtimeInput': {
          'audio': {'data': b64, 'mimeType': _micMime}
        }
      });

  /// Duck the agent the moment the user starts talking over it; Gemini's `interrupted` confirms it.
  void _detectBargeIn(double lvl, double ms) {
    final speaking = _now() < _playingUntil;
    // Echo cancellation removes most of the agent's own voice; scaling by its loudness covers the rest.
    final threshold = barge.floor + barge.echo * levels.out.value;
    if (!speaking || lvl <= threshold) {
      _loudMs = 0;
      return;
    }
    _loudMs += ms;
    if (_loudMs < barge.holdMs || _ducked != null) return;
    audio.setGain(barge.duck);
    onBargeIn?.call();
    _ducked = Timer(Duration(milliseconds: barge.falseAlarmMs), () {
      // No `interrupted` came: a cough or a door, so bring the agent back.
      _ducked = null;
      _loudMs = 0;
      audio.setGain(1);
    });
  }

  Future<void> _onMessage(Object? raw) async {
    final Map<String, dynamic> msg;
    try {
      // Gemini sends JSON in binary frames.
      msg = jsonDecode(raw is String ? raw : utf8.decode(raw as List<int>)) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (msg['setupComplete'] != null && !_ready) {
      _ready = true;
      await _ensureMic();
      if (!_ready) return;
      final resumed = _resumeAfterSetup;
      _resumeAfterSetup = false;
      if (_snap.switching) _set(_snap.copyWith(switching: false));
      final queued = _queuedText;
      _queuedText = [];
      if (queued.isNotEmpty) sendText(queued.join('\n'));
      final buffered = _micBuffer;
      _micBuffer = [];
      buffered.forEach(_sendAudio);
      _micBufferMs = 0;
      _refresh();
      if (resumed) onResume?.call();
    }
    final content = msg['serverContent'] as Map<String, dynamic>?;
    if (content != null) {
      final modelTurn = content['modelTurn'] as Map<String, dynamic>?;
      final inText = (content['inputTranscription'] as Map?)?['text'] as String?;
      final outText = (content['outputTranscription'] as Map?)?['text'] as String?;
      if (content['interrupted'] == true) _cutOff();
      if (!_discardTurn) {
        for (final part in maps(modelTurn?['parts'])) {
          final data = (part['inlineData'] as Map?)?['data'] as String?;
          if (data != null && data.isNotEmpty) _play(data);
        }
        if (modelTurn != null || content['outputTranscription'] != null) _modelTurn = true;
      }
      if (inText != null && inText.isNotEmpty) _caption(true, inText);
      if (outText != null && outText.isNotEmpty && !_discardTurn) _caption(false, outText);
      if (content['turnComplete'] == true) {
        _modelTurn = false;
        _discardTurn = false;
        _answering = null;
      }
      _refresh();
      if ((content['turnComplete'] == true || content['interrupted'] == true) && _pending == 0) onIdle?.call();
    }
    final calls = maps((msg['toolCall'] as Map?)?['functionCalls']);
    if (calls.isNotEmpty) _endUserTurn(_heard);
    for (final call in calls) {
      _runTool(call);
    }
  }

  void _caption(bool user, String text) {
    if (user) {
      // A new user turn clears the previous exchange.
      final fresh = _lastSpeaker != 'user';
      _heard = fresh ? text : _heard + text;
      _set(fresh ? _snap.copyWith(userText: text.trimLeft(), agentText: '') : _snap.copyWith(userText: _snap.userText + text));
      if (_ask != null && _stop.hasMatch(_heard)) _cancelAsk();
    } else {
      if (_lastSpeaker == 'user') _endUserTurn(_heard);
      final fresh = _lastSpeaker != 'agent';
      final agentText = fresh ? text.trimLeft() : _snap.agentText + text;
      // The confirm card follows the agent's latest turn: shown while it asks, gone once it moves on.
      _set(_snap.copyWith(agentText: agentText, confirming: _confirm.hasMatch(agentText)));
    }
    _lastSpeaker = user ? 'user' : 'agent';
  }

  /// The user finished an utterance: anything but confirm/yes drops a pending read-back.
  void _endUserTurn(String said) {
    if (!_snap.confirming || _agree.hasMatch(said)) return;
    _tapConfirmed = false;
    _heard = '';
    _set(_snap.copyWith(confirming: false));
    _notify('Cancelled approval');
  }

  void _play(String b64) {
    final (:seconds, :level) = audio.play(b64);
    _playingUntil = (_playingUntil > _now() ? _playingUntil : _now()) + (seconds * 1000).round();
    levels.out.value = level;
    _playTimer?.cancel();
    _playTimer = Timer(Duration(milliseconds: _playingUntil - _now() + 20), () {
      levels.out.value = 0;
      _refresh();
    });
  }

  Future<void> _runTool(Map<String, dynamic> call) async {
    _pending++;
    _refresh();
    final name = '${call['name']}';
    final output = await _tool(name, (call['args'] as Map<String, dynamic>?) ?? const {});
    _pending--;
    if (_ready && !_stopped) {
      _send({
        'toolResponse': {
          'functionResponses': [
            {
              'id': call['id'],
              'name': name,
              'response': {'output': output}
            }
          ]
        }
      });
    }
    _refresh();
    if (_pending == 0 && !_modelTurn) onIdle?.call();
  }

  Future<String> _tool(String name, Map<String, dynamic> args) async {
    final pid = projectId;
    String str(String k) => '${args[k] ?? ''}'.trim();
    try {
      switch (name) {
        case 'send_to_agent':
          return await _askAgent(str('text'));
        case 'get_status':
          final d = (await api('/projects/$pid/delivery')) as Map<String, dynamic>;
          final err = d['last_error'];
          return cleanMessage('${d['message'] ?? ''}') + (err != null ? ' Last error: ${cleanMessage('$err')}' : '');
        case 'resume_delivery':
          final d = (await api('/projects/$pid/delivery/resume', method: 'POST')) as Map<String, dynamic>;
          onAction?.call();
          return 'Resumed. ${cleanMessage('${d['message'] ?? ''}')}';
        case 'cancel_delivery':
          if (!_takeConfirmation()) return _notConfirmed;
          final d = (await api('/projects/$pid/delivery/cancel', method: 'POST')) as Map<String, dynamic>;
          onAction?.call();
          return 'Cancelled. ${cleanMessage('${d['message'] ?? ''}')}';
        case 'approve_revision':
        case 'request_changes':
          if (!_takeConfirmation()) return _notConfirmed;
          final stage = str('stage').toLowerCase();
          final revision = num.tryParse('${args['revision']}');
          // Re-read the gate right now: the revision read back may have been superseded while the user spoke.
          final d = (await api('/projects/$pid/delivery')) as Map<String, dynamic>;
          final p = d['pending'] as Map<String, dynamic>?;
          final payload = p?['payload'] as Map<String, dynamic>?;
          final gate = p?['stage'] ?? payload?['stage'];
          if (p?['kind'] != 'approval' || gate != stage || payload?['revision'] != revision) {
            return 'Not done: $stage revision ${args['revision']} is not waiting for approval. Current state: ${cleanMessage('${d['message'] ?? ''}')}';
          }
          final approve = name == 'approve_revision';
          final comment = str('comment');
          if (!approve && comment.isEmpty) return 'Not done: ask the user what should change, then read it back.';
          await api('/projects/$pid/artifacts/$stage/revisions/$revision/${approve ? 'approve' : 'request-changes'}',
              method: 'POST', json: approve ? <String, dynamic>{} : {'comment': comment});
          onAction?.call();
          return approve ? 'Approved $stage revision $revision.' : 'Sent the change request for $stage revision $revision.';
        default:
          return 'Unknown tool $name.';
      }
    } catch (err) {
      return errorMessage(err);
    }
  }

  /// One confirmation buys one action: spoken/typed "confirm" or the Confirm tap, then both reset.
  bool _takeConfirmation() {
    final ok = _tapConfirmed || saidConfirm(_heard);
    if (ok) {
      _tapConfirmed = false;
      _heard = '';
      _set(_snap.copyWith(confirming: false));
    }
    return ok;
  }

  /// The user said stop while their request was with an agent: cancel its run.
  Future<void> _cancelAsk() async {
    final ask = _ask;
    if (ask == null || ask.cancelled) return;
    ask.cancelled = true;
    if (ask.runId != null) await _cancelRun(ask.runId!);
  }

  Future<void> _cancelRun(String runId) async {
    try {
      await api('/projects/$projectId/runs/$runId/cancel', method: 'POST');
      onMessages?.call();
    } catch (_) {
      // The run may already be done; the user still hears it was cancelled.
    }
  }

  /// Posts to the channel and waits for the agent's reply; any failure becomes words to read out.
  Future<String> _askAgent(String text) async {
    if (text.isEmpty) return 'Nothing was passed on: the request was empty.';
    final channel = _snap.channel;
    final ask = _Ask();
    _ask = ask;
    _asking.add(channel);
    try {
      return await _askOn(channel, text, ask);
    } finally {
      _asking.remove(channel);
      if (identical(_ask, ask)) _ask = null;
    }
  }

  Future<String> _askOn(String channel, String text, _Ask ask) async {
    final path = '/projects/$projectId/conversations/$channel/messages';
    final int seq;
    try {
      final sent = (await api(path, method: 'POST', json: {'text': text})) as Map<String, dynamic>;
      seq = (sent['message'] as Map)['seq'] as int;
      ask.runId = (sent['run'] as Map?)?['id'] as String?;
    } catch (err) {
      return errorMessage(err);
    }
    _own.add('$channel:$seq');
    onMessages?.call();
    // "Stop" said before the post came back: cancel now that the run id is known.
    if (ask.cancelled) {
      if (ask.runId != null) await _cancelRun(ask.runId!);
      return 'Cancelled by the user.';
    }

    final deadline = _now() + replyTimeoutMs;
    while (!_stopped && _now() < deadline) {
      await Future<void>.delayed(Duration(milliseconds: pollMs));
      if (ask.cancelled) return 'Cancelled by the user.';
      try {
        final replies = maps(await api('$path?after=$seq')).where((m) {
          final refs = m['refs'] as Map?;
          return (m['seq'] as int) > seq && m['role'] != 'user' && !(m['role'] == 'system' && refs?['progress'] == true);
        }).toList();
        if (ask.cancelled) return 'Cancelled by the user.';
        if (replies.isNotEmpty) {
          for (final m in replies) {
            _own.add('$channel:${m['seq']}');
          }
          onMessages?.call();
          return replies.map((m) => cleanMessage('${m['text']}')).join('\n\n');
        }
      } catch (_) {
        // Transient poll failure: keep waiting until the deadline.
      }
    }
    return 'The agent is still working on this. Its reply will appear in the chat.';
  }
}

/// A mutable loudness 0..1 the orb samples each frame.
class Level {
  double value = 0;
}

VoiceErrorKind _sessionErrorKind(Object err) {
  if (err is! ApiError) return VoiceErrorKind.session;
  if (err.status == 0) return VoiceErrorKind.network;
  if (err.status == 429) return VoiceErrorKind.quota;
  if (err.status == 502 || err.status == 503 || err.code == 'VOICE_UNAVAILABLE') return VoiceErrorKind.unavailable;
  return VoiceErrorKind.session;
}
