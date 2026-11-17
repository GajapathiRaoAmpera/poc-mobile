/// Native mic capture (record) + streamed PCM playback (flutter_pcm_sound) + system interruptions (audio_session).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:audio_session/audio_session.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart' hide IosAudioCategory;

import 'live_client.dart';

const _micRate = 16000;
const _outRate = 24000;
// Fed to the native player in ~100 ms slices, so a flush or a gain change is heard within that.
const _slice = _outRate ~/ 10;

/// Loudness 0..1 for the orb: RMS of little-endian PCM16, scaled so normal speech lands around 0.5.
double pcmLevel(Uint8List bytes) {
  final n = bytes.length ~/ 2;
  if (n == 0) return 0;
  final view = ByteData.sublistView(bytes);
  var sum = 0.0;
  for (var i = 0; i < n; i++) {
    final s = view.getInt16(i * 2, Endian.little) / 32768;
    sum += s * s;
  }
  return math.min(1, math.sqrt(sum / n) * 5);
}

/// Copy of PCM16 with every sample multiplied by [gain] (clamped).
Uint8List scalePcm(Uint8List bytes, double gain) {
  if (gain == 1) return bytes;
  final out = Uint8List.fromList(bytes);
  final view = ByteData.sublistView(out);
  for (var i = 0; i + 1 < out.length; i += 2) {
    view.setInt16(i, (view.getInt16(i, Endian.little) * gain).round().clamp(-32768, 32767), Endian.little);
  }
  return out;
}

class DeviceAudio implements AudioIO {
  final _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _mic;
  int? _carry; // odd trailing byte between mic chunks
  bool _playerReady = false;
  bool _feeding = false;
  final _queue = <Uint8List>[];
  double _gain = 1;

  @override
  Future<bool> requestPermission() => _recorder.hasPermission();

  @override
  Future<void> startMic(void Function(String base64, double level) onChunk) async {
    // Player first: record then sets the final iOS session (playAndRecord + defaultToSpeaker).
    await _setupPlayer();
    final stream = await _recorder.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: _micRate,
      numChannels: 1,
      // Voice-chat capture with echo cancellation, so barge-in hears the user and not the agent.
      echoCancel: true,
      noiseSuppress: true,
      autoGain: true,
      androidConfig: AndroidRecordConfig(
        audioSource: AndroidAudioSource.voiceCommunication,
        audioManagerMode: AudioManagerMode.modeInCommunication,
        speakerphone: true,
      ),
      // LiveClient pauses and resumes itself (watchSystem).
      audioInterruption: AudioInterruptionMode.none,
    ));
    _mic = stream.listen((chunk) {
      var bytes = chunk;
      if (_carry != null) bytes = Uint8List.fromList([_carry!, ...chunk]);
      _carry = bytes.length.isOdd ? bytes.last : null;
      if (bytes.length.isOdd) bytes = Uint8List.sublistView(bytes, 0, bytes.length - 1);
      if (bytes.isNotEmpty) onChunk(base64Encode(bytes), pcmLevel(bytes));
    });
  }

  @override
  void stopMic() {
    _mic?.cancel();
    _mic = null;
    _carry = null;
    _recorder.stop().catchError((_) => null);
  }

  Future<void> _setupPlayer() async {
    if (_playerReady) return;
    await FlutterPcmSound.setLogLevel(LogLevel.error);
    await FlutterPcmSound.setup(sampleRate: _outRate, channelCount: 1, iosAudioCategory: IosAudioCategory.playAndRecord);
    await FlutterPcmSound.setFeedThreshold(_slice);
    FlutterPcmSound.setFeedCallback((_) => _feed());
    _playerReady = true;
  }

  /// Hands the native player the next slice; called again by the player when it runs low.
  void _feed() {
    if (_queue.isEmpty) {
      _feeding = false;
      return;
    }
    _feeding = true;
    final builder = BytesBuilder(copy: false);
    while (_queue.isNotEmpty && builder.length < _slice * 2) {
      final next = _queue.first;
      final room = _slice * 2 - builder.length;
      if (next.length <= room) {
        builder.add(_queue.removeAt(0));
      } else {
        builder.add(Uint8List.sublistView(next, 0, room));
        _queue[0] = Uint8List.sublistView(next, room);
      }
    }
    FlutterPcmSound.feed(PcmArrayInt16(bytes: ByteData.sublistView(scalePcm(builder.takeBytes(), _gain))));
  }

  @override
  ({double seconds, double level}) play(String base64) {
    final bytes = base64Decode(base64);
    _queue.add(bytes);
    if (_playerReady && !_feeding) _feed();
    return (seconds: bytes.length / 2 / _outRate, level: pcmLevel(bytes));
  }

  @override
  void flush() => _queue.clear();

  @override
  void setGain(double gain) => _gain = gain;

  @override
  void Function() watchSystem(void Function(SystemAudioEvent e) cb) {
    final subs = <StreamSubscription<Object?>>[];
    var cancelled = false;
    AudioSession.instance.then((s) {
      if (cancelled) return;
      subs
        ..add(s.interruptionEventStream.listen((e) => cb(e.begin ? SystemAudioEvent.interrupted : SystemAudioEvent.resumable)))
        ..add(s.becomingNoisyEventStream.listen((_) => cb(SystemAudioEvent.unplugged)));
    });
    return () {
      cancelled = true;
      for (final s in subs) {
        s.cancel();
      }
    };
  }

  @override
  void close() {
    stopMic();
    flush();
    _recorder.dispose();
    if (_playerReady) {
      FlutterPcmSound.setFeedCallback(null);
      FlutterPcmSound.release();
      _playerReady = false;
    }
  }
}
