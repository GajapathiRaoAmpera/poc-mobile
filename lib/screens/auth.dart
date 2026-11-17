/// Sign in, create account, forgot password (rules mirror the backend: app/core/security.py).
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../ui/kit.dart';

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

String? validateEmail(String? v) {
  final s = (v ?? '').trim();
  if (s.isEmpty) return 'Enter your email address';
  return _emailRe.hasMatch(s) ? null : 'Enter a valid email address';
}

String? validateNewPassword(String? v) {
  final s = v ?? '';
  if (s.length < 10) return 'Use at least 10 characters';
  return s.length > 128 ? 'Use at most 128 characters' : null;
}

Future<void> openWeb() => launchUrl(Uri.parse(webUrl), mode: LaunchMode.inAppBrowserView);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  Object? _error;
  bool _busy = false;

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _busy) return;
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await session.signIn(_email.text, _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final adminOnWeb = _error is ApiError && (_error as ApiError).status == 403;
    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _form,
          autovalidateMode: AutovalidateMode.onUnfocus,
          child: AutofillGroup(
            child: FormBody(children: [
              Padding(
                padding: EdgeInsets.only(top: sp(8), bottom: sp(2)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Image.asset('assets/brand/ampera-logo.png', width: 140, height: 39, semanticLabel: 'Ampera'),
                  SizedBox(height: sp(6)),
                  Text('Welcome back', style: T.display),
                  SizedBox(height: sp(2)),
                  Text('Check on your projects and keep the agents moving.', style: T.muted),
                ]),
              ),
              if (session.expired && _error == null)
                const Notice('Your session has expired. Sign in again to continue.', tone: Tone.info),
              if (_error != null)
                Notice(
                  errorMessage(_error),
                  child: adminOnWeb
                      ? Btn('Open the web app', small: true, variant: BtnVariant.secondary, onPressed: openWeb)
                      : null,
                ),
              LabeledField(
                label: 'Email',
                controller: _email,
                validator: validateEmail,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
              ),
              LabeledField(
                label: 'Password',
                controller: _password,
                secret: true,
                validator: (v) => (v ?? '').isEmpty ? 'Enter your password' : null,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _submit(),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: Btn('Forgot password?',
                    small: true, variant: BtnVariant.tertiary, onPressed: () => push(context, const ForgotPasswordScreen())),
              ),
              Btn('Sign in', block: true, loading: _busy, onPressed: _submit),
              Padding(
                padding: EdgeInsets.only(top: sp(6)),
                child: Wrap(alignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text('New to Ampera?', style: T.muted),
                  Btn('Create an account',
                      small: true, variant: BtnVariant.tertiary, onPressed: () => push(context, const RegisterScreen())),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  Map<String, String> _fields = {};
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _fields = {});
    if (!_form.currentState!.validate() || _busy) return;
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await session.register(_name.text, _email.text, _password.text);
    } catch (e) {
      final fields = Map.fromEntries(fieldErrors(e).entries.where((f) => const {'name', 'email', 'password'}.contains(f.key)));
      if (mounted) {
        setState(() {
          _fields = fields;
          _error = fields.isEmpty ? errorMessage(e) : null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Create account')),
        body: Form(
          key: _form,
          autovalidateMode: AutovalidateMode.onUnfocus,
          child: AutofillGroup(
            child: FormBody(children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Start your first project', style: T.title),
                SizedBox(height: sp(2)),
                Text('Describe an idea and the agents turn it into requirements, an architecture, a plan and a budget.',
                    style: T.muted),
              ]),
              if (_error != null) Notice(_error!),
              LabeledField(
                label: 'Your name',
                controller: _name,
                serverError: _fields['name'],
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                validator: (v) {
                  final s = (v ?? '').trim();
                  if (s.isEmpty) return 'Enter your name';
                  return s.length > 120 ? 'Use at most 120 characters' : null;
                },
              ),
              LabeledField(
                label: 'Email',
                controller: _email,
                serverError: _fields['email'],
                validator: validateEmail,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
              ),
              LabeledField(
                label: 'Password',
                hint: 'At least 10 characters',
                controller: _password,
                serverError: _fields['password'],
                secret: true,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
                validator: (v) =>
                    validateNewPassword(v) ??
                    ((v ?? '').trim().toLowerCase() == _email.text.trim().toLowerCase()
                        ? 'Password must not be the same as your email'
                        : null),
              ),
              Btn('Create account', block: true, loading: _busy, onPressed: _submit),
            ]),
          ),
        ),
      );
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  Object? _error;
  bool _busy = false;
  bool _sent = false;

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await api('/auth/password-reset/request', method: 'POST', json: {'email': _email.text.trim()});
      if (mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Reset password')),
        body: Form(
          key: _form,
          autovalidateMode: AutovalidateMode.onUnfocus,
          child: FormBody(
            children: _sent
                ? [
                    Text('Check your email', style: T.title),
                    Text(
                      "If an account exists for ${_email.text.trim()}, we've sent a link to reset your password. Open it on this "
                      'phone or your computer, then sign in here with the new password.',
                      style: T.muted,
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Btn('Back to sign in', variant: BtnVariant.secondary, onPressed: () => Navigator.pop(context)),
                    ),
                  ]
                : [
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Forgot your password?', style: T.title),
                      SizedBox(height: sp(3)),
                      Text("Enter your email and we'll send you a link to choose a new one.", style: T.muted),
                    ]),
                    if (_error != null) Notice(errorMessage(_error)),
                    LabeledField(
                      label: 'Email',
                      controller: _email,
                      validator: validateEmail,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      onSubmitted: (_) => _submit(),
                    ),
                    Btn('Send reset link', block: true, loading: _busy, onPressed: _submit),
                  ],
          ),
        ),
      );
}
