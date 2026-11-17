import 'dart:convert';
import 'dart:typed_data';

import 'package:ampera/core/api.dart';
import 'package:ampera/core/format.dart';
import 'package:ampera/voice/audio.dart';
import 'package:ampera/voice/delivery_voice.dart';
import 'package:ampera/voice/live_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeAudio implements AudioIO {
  @override
  Future<bool> requestPermission() async => true;
  @override
  Future<void> startMic(void Function(String, double) onChunk) async {}
  @override
  void stopMic() {}
  @override
  ({double seconds, double level}) play(String base64) => (seconds: 0, level: 0);
  @override
  void flush() {}
  @override
  void setGain(double gain) {}
  @override
  void Function() watchSystem(void Function(SystemAudioEvent e) cb) => () {};
  @override
  void close() {}
}

class FakeSocket implements LiveSocket {
  final sent = <Map<String, dynamic>>[];
  late void Function(Object? data) deliver;
  @override
  void send(String data) => sent.add(jsonDecode(data) as Map<String, dynamic>);
  @override
  void close() {}
}

void main() {
  test('saidConfirm needs an un-negated "confirm"', () {
    expect(saidConfirm('yes, confirm'), isTrue);
    expect(saidConfirm('Confirm it'), isTrue);
    expect(saidConfirm("don't confirm"), isFalse);
    expect(saidConfirm('no, do not confirm it'), isFalse);
    expect(saidConfirm('approve it'), isFalse);
  });

  test('format helpers', () {
    expect(cleanMessage('Calling groq/llama-3 (repair 1/2)'), 'Reasoning over the inputs (self-correction 1/2)');
    expect(cleanMessage('Model provider returned HTTP 429'), 'The AI service is busy (rate limit reached)');
    expect(cleanMessage('Drafted (gemini/flash-2), done'), 'Drafted, done');
    expect(relativeTime('2026-01-01T00:00:00Z', DateTime.utc(2026, 1, 1, 0, 5)), '5m ago');
    expect(relativeTime('2026-01-01T00:00:00Z', DateTime.utc(2026, 1, 1)), 'just now');
    expect(formatMoney('1234567.50', 'USD'), r'$1,234,568');
    expect(formatMoney('900', 'CHF'), 'CHF 900');
    expect(formatDay('2026-11-02'), 'Nov 2');
    expect(roleLabel('qa_engineer'), 'QA engineer');
  });

  test('pcm level and gain', () {
    final loud = Uint8List(4);
    ByteData.sublistView(loud)
      ..setInt16(0, 16384, Endian.little)
      ..setInt16(2, -16384, Endian.little);
    expect(pcmLevel(loud), 1); // 0.5 RMS * 5, clamped
    expect(pcmLevel(Uint8List(0)), 0);
    final half = scalePcm(loud, 0.5);
    expect(ByteData.sublistView(half).getInt16(0, Endian.little), 8192);
    expect(ByteData.sublistView(loud).getInt16(0, Endian.little), 16384, reason: 'input untouched');
  });

  test('activeChannel follows the gate, then the newest working agent', () {
    expect(activeChannel({'pending': {'kind': 'approval', 'stage': 'plan'}}), 'plan');
    expect(activeChannel({'pending': {'kind': 'approval', 'payload': {'stage': 'budget'}}}), 'budget');
    expect(activeChannel({'status': 'RUNNING'}, 'code'), 'code');
    expect(activeChannel({'status': 'IDLE'}, 'code'), 'intake');
    expect(activeChannel(null), 'intake');
  });

  test('api sends the mobile header and maps validation errors', () async {
    late http.Request seen;
    httpClient = MockClient((req) async {
      seen = req;
      return http.Response(
          jsonEncode({
            'error': {
              'code': 'VALIDATION_ERROR',
              'message': 'Invalid',
              'details': [
                {'loc': ['body', 'email'], 'msg': 'Value error, bad email'}
              ]
            }
          }),
          422);
    });
    try {
      await api('/auth/token/register', method: 'POST', json: {'email': 'x'});
      fail('should throw');
    } on ApiError catch (e) {
      expect(e.status, 422);
      expect(fieldErrors(e), {'email': 'bad email'});
    }
    expect(seen.headers['x-client'], 'mobile');
    expect(seen.headers['content-type'], startsWith('application/json'));
  });

  test('voice approve only runs after the user says confirm', () async {
    final posts = <String>[];
    httpClient = MockClient((req) async {
      if (req.method == 'POST') posts.add(req.url.path);
      if (req.url.path.endsWith('/voice/session')) {
        return http.Response(jsonEncode({'token': 't', 'model': 'gemini-live'}), 200);
      }
      if (req.url.path.endsWith('/delivery')) {
        return http.Response(
            jsonEncode({
              'status': 'PAUSED',
              'message': 'Waiting',
              'pending': {'kind': 'approval', 'stage': 'requirements', 'payload': {'revision': 2}},
            }),
            200);
      }
      return http.Response('{}', 200);
    });
    final socket = FakeSocket();
    final client = LiveClient(
      projectId: 'p1',
      channel: 'requirements',
      audio: FakeAudio(),
      onChange: (_) {},
      createSocket: (url, {required onOpen, required onMessage, required onClose}) {
        socket.deliver = onMessage;
        Future.microtask(onOpen);
        return socket;
      },
    );
    await client.start();
    await pumpEventQueue();
    socket.deliver(jsonEncode({'setupComplete': {}}));
    await pumpEventQueue();

    String lastOutput() =>
        (((socket.sent.last['toolResponse'] as Map)['functionResponses'] as List).first as Map)['response']['output'] as String;
    void call(String id) => socket.deliver(jsonEncode({
          'toolCall': {
            'functionCalls': [
              {'id': id, 'name': 'approve_revision', 'args': {'stage': 'requirements', 'revision': 2}}
            ]
          }
        }));

    call('a');
    await pumpEventQueue();
    expect(lastOutput(), startsWith('Not done'));
    expect(posts.where((p) => p.endsWith('/approve')), isEmpty);

    client.type('confirm');
    call('b');
    await pumpEventQueue();
    expect(lastOutput(), 'Approved requirements revision 2.');
    expect(posts.last, '/api/v1/projects/p1/artifacts/requirements/revisions/2/approve');
    client.dispose();
  });
}
