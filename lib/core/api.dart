/// JSON client for the FastAPI backend (bearer token, `X-Client: mobile`), the session, and polling loaders.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiError implements Exception {
  ApiError(this.status, this.code, this.message, [this.details]);
  final int status;
  final String code;
  final String message;
  final Object? details;
  @override
  String toString() => 'ApiError($status, $code): $message';
}

String _trim(String s) => s.endsWith('/') ? s.substring(0, s.length - 1) : s;

/// Set with `--dart-define-from-file=.env.local` (see Makefile); the phone needs the LAN IP, not localhost.
// EXPO_PUBLIC_* are the key names of .env.local files from the old Expo app.
final apiUrl = _trim(const String.fromEnvironment('API_URL',
    defaultValue: String.fromEnvironment('EXPO_PUBLIC_API_URL', defaultValue: 'http://localhost:8000')));
final webUrl = _trim(const String.fromEnvironment('WEB_URL',
    defaultValue: String.fromEnvironment('EXPO_PUBLIC_WEB_URL', defaultValue: 'http://localhost:3000')));

const _generic = 'Something went wrong. Please try again.';
// Endpoints where 401 means "wrong credentials", not "session expired".
const _credentialEndpoints = ['/auth/token', '/auth/password-reset'];

/// Swappable in tests (package:http/testing.dart MockClient).
http.Client httpClient = http.Client();
String? _token;
void Function() _onUnauthorized = () {};

Future<dynamic> api(String path, {String method = 'GET', Object? json}) async {
  final req = http.Request(method, Uri.parse('$apiUrl/api/v1$path'))
    ..headers.addAll({
      'accept': 'application/json',
      // Lets the backend's CSRF origin check recognise the native app (poc-backend app/core/origin.py).
      'x-client': 'mobile',
      'authorization': ?(_token == null ? null : 'Bearer $_token'),
      'content-type': ?(json == null ? null : 'application/json'),
    });
  if (json != null) req.body = jsonEncode(json);

  final http.Response res;
  try {
    res = await http.Response.fromStream(await httpClient.send(req).timeout(const Duration(seconds: 30)));
  } catch (_) {
    throw ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");
  }
  if (res.statusCode == 204) return null;

  dynamic body;
  try {
    body = jsonDecode(utf8.decode(res.bodyBytes));
  } catch (_) {}
  if (res.statusCode >= 200 && res.statusCode < 300) return body;

  final err = body is Map ? body['error'] : null;
  final apiErr = err is Map && err['code'] is String
      ? ApiError(res.statusCode, err['code'] as String,
          (err['message'] is String && (err['message'] as String).isNotEmpty) ? err['message'] as String : _generic, err['details'])
      : ApiError(res.statusCode, 'INTERNAL', _generic);
  if (res.statusCode == 401 && !_credentialEndpoints.any(path.startsWith)) _onUnauthorized();
  throw apiErr;
}

String errorMessage(Object? err) => err is ApiError ? err.message : _generic;

/// Field errors from a 422 VALIDATION_ERROR, keyed by the last loc segment.
Map<String, String> fieldErrors(Object? err) {
  if (err is! ApiError || err.code != 'VALIDATION_ERROR' || err.details is! List) return {};
  final out = <String, String>{};
  for (final d in err.details as List) {
    if (d is! Map) continue;
    final loc = d['loc'];
    final key = loc is List && loc.isNotEmpty ? loc.last : null;
    final msg = d['msg'];
    if (key is String && msg is String && msg.isNotEmpty) out[key] = msg.replaceFirst(RegExp(r'^Value error, '), '');
  }
  return out;
}

/// Bumped after any change (approve, send, intake…) and when the app returns to the foreground;
/// every live [Loader] refetches. Replaces react-query's cache invalidation.
class _RefreshBus extends ChangeNotifier {
  void bump() => notifyListeners();
}

final refreshBus = _RefreshBus();
void refreshAll() => refreshBus.bump();

enum SessionStatus { loading, signedOut, signedIn }

class Session extends ChangeNotifier {
  static const _key = 'ampera.session';
  final _store = const FlutterSecureStorage();
  SessionStatus status = SessionStatus.loading;
  Map<String, dynamic>? user;

  /// Shown once on the login screen after the server rejected a stored token.
  bool expired = false;

  Future<void> restore() async {
    _onUnauthorized = () => _clear(true);
    final stored = await _store.read(key: _key).catchError((_) => null);
    if (stored == null) return _set(SessionStatus.signedOut);
    _token = stored;
    try {
      user = (await api('/auth/me')) as Map<String, dynamic>;
      _set(SessionStatus.signedIn);
    } catch (e) {
      // A 401 already signed out via _onUnauthorized. Offline: stay signed in, screens show retry.
      if (!(e is ApiError && e.status == 401)) _set(SessionStatus.signedIn);
    }
  }

  Future<void> signIn(String email, String password) =>
      _start('/auth/token', {'email': email.trim(), 'password': password});

  Future<void> register(String name, String email, String password) =>
      _start('/auth/token/register', {'name': name.trim(), 'email': email.trim(), 'password': password});

  Future<void> signOut() async {
    await api('/auth/logout', method: 'POST').catchError((_) => null);
    await _clear(false);
  }

  Future<void> _start(String path, Map<String, String> body) async {
    final out = (await api(path, method: 'POST', json: body)) as Map<String, dynamic>;
    await _store.write(key: _key, value: out['token'] as String);
    _token = out['token'] as String;
    user = out['user'] as Map<String, dynamic>;
    expired = false;
    _set(SessionStatus.signedIn);
  }

  Future<void> _clear(bool wasExpired) async {
    if (status == SessionStatus.signedOut) return;
    _token = null;
    await _store.delete(key: _key).catchError((_) {});
    user = null;
    expired = wasExpired;
    _set(SessionStatus.signedOut);
  }

  void _set(SessionStatus s) {
    status = s;
    notifyListeners();
  }
}

final session = Session();

/// One fetched resource for a screen: loads on creation, refetches on [refreshAll], and polls
/// every 4 s while [poll] says an agent is working (mobile has no live stream).
class Loader<V> extends ChangeNotifier {
  Loader(this._fetch, {bool Function()? poll}) : _poll = poll {
    refreshBus.addListener(load);
    load();
  }
  final Future<V> Function() _fetch;
  final bool Function()? _poll;
  V? data;
  Object? error;
  bool loading = true;
  bool _inFlight = false;
  bool _disposed = false;
  Timer? _timer;

  bool get hasData => data != null;

  Future<void> load() async {
    if (_inFlight || _disposed) return;
    _inFlight = true;
    try {
      data = await _fetch();
      error = null;
    } catch (e) {
      error = e;
    } finally {
      _inFlight = false;
      loading = false;
    }
    if (_disposed) return;
    notifyListeners();
    schedule();
  }

  /// Re-checks whether to keep polling (call when the condition's inputs change).
  void schedule() {
    _timer?.cancel();
    if (!_disposed && (_poll?.call() ?? false)) _timer = Timer(const Duration(seconds: 4), load);
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    refreshBus.removeListener(load);
    super.dispose();
  }
}
