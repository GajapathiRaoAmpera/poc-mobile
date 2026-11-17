/// Ampera brand tokens (mirrored from poc-frontend/src/styles/_tokens.scss) and the shared widgets.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';

abstract final class C {
  static const bg = Color(0xFFFCFCFC);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF5F5F4);
  static const text = Color(0xFF050505);
  static const textMuted = Color(0xFF5B5B5B);
  static const border = Color(0x1A050505);
  static const borderStrong = Color(0x40050505);
  static const borderInput = Color(0xFF8D8D8D);
  static const primary = Color(0xFF9C369A);
  static const primaryPressed = Color(0xFF7E2B7C);
  static const primaryFg = Color(0xFFFFFFFF);
  static const primarySubtle = Color(0xFFF7EDF7);
  static const navy = Color(0xFF000F5C);
  static const cream = Color(0xFFFFFEFA);
  static const lavender = Color(0xFF8070B4);
  static const success = Color(0xFF1E7B4A);
  static const successSubtle = Color(0xFFE8F4ED);
  static const warning = Color(0xFF8A5A00);
  static const warningSubtle = Color(0xFFFDF4E3);
  static const danger = Color(0xFFB42318);
  static const dangerSubtle = Color(0xFFFDECEA);
  static const info = Color(0xFF1D4ED8);
  static const infoSubtle = Color(0xFFEAF0FD);
}

/// 4pt spacing: sp(4) = 16.
double sp(double n) => n * 4;

enum Tone { neutral, primary, success, warning, danger, info }

extension ToneColors on Tone {
  Color get fg => switch (this) {
        Tone.neutral => C.textMuted,
        Tone.primary => C.primary,
        Tone.success => C.success,
        Tone.warning => C.warning,
        Tone.danger => C.danger,
        Tone.info => C.info,
      };
  Color get bg => switch (this) {
        Tone.neutral => C.surfaceMuted,
        Tone.primary => C.primarySubtle,
        Tone.success => C.successSubtle,
        Tone.warning => C.warningSubtle,
        Tone.danger => C.dangerSubtle,
        Tone.info => C.infoSubtle,
      };
}

/// Text variants of the RN app's `Text variant`.
abstract final class T {
  static const _base = TextStyle(fontFamily: 'Switzer', color: C.text);
  static final display = _base.copyWith(fontSize: 30, height: 36 / 30, fontWeight: FontWeight.w300, letterSpacing: -0.6);
  static final title = _base.copyWith(fontSize: 24, height: 32 / 24, fontWeight: FontWeight.w500, letterSpacing: -0.3);
  static final heading = _base.copyWith(fontSize: 20, height: 28 / 20, fontWeight: FontWeight.w500);
  static final body = _base.copyWith(fontSize: 16, height: 1.5);
  static final muted = body.copyWith(color: C.textMuted);
  static final label = _base.copyWith(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w500);
  static final caption = _base.copyWith(fontSize: 14, height: 20 / 14, color: C.textMuted);
  static final eyebrow =
      _base.copyWith(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500, color: C.textMuted, letterSpacing: 0.8);
  static final mono = _base.copyWith(fontFamily: 'FragmentMono', fontSize: 14, height: 20 / 14);
}

/// Uppercase small label (the RN "eyebrow" variant).
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(), style: T.eyebrow.copyWith(color: color));
}

ThemeData amperaTheme() {
  const inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(8)),
    borderSide: BorderSide(color: C.borderInput),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Switzer',
    scaffoldBackgroundColor: C.bg,
    colorScheme: ColorScheme.fromSeed(seedColor: C.primary, primary: C.primary, surface: C.bg, error: C.danger),
    appBarTheme: AppBarTheme(
      backgroundColor: C.bg,
      foregroundColor: C.primary,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: T.label.copyWith(fontSize: 17),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.surface,
      contentPadding: const EdgeInsets.all(12),
      border: inputBorder,
      enabledBorder: inputBorder,
      focusedBorder: inputBorder.copyWith(borderSide: const BorderSide(color: C.primary, width: 2)),
      errorBorder: inputBorder.copyWith(borderSide: const BorderSide(color: C.danger)),
      focusedErrorBorder: inputBorder.copyWith(borderSide: const BorderSide(color: C.danger, width: 2)),
      hintStyle: T.body.copyWith(color: C.textMuted),
      helperStyle: T.caption,
      helperMaxLines: 3,
      errorStyle: T.caption.copyWith(color: C.danger),
      errorMaxLines: 3,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: C.surface,
      indicatorColor: C.primarySubtle,
      labelTextStyle: WidgetStatePropertyAll(T.label.copyWith(fontSize: 12)),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? C.primary : C.textMuted),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: C.primary),
    textSelectionTheme: const TextSelectionThemeData(cursorColor: C.primary),
  );
}

enum BtnVariant { primary, secondary, tertiary, danger }

/// Brand pill button: 48pt tall (36 small), haptic tick on press.
class Btn extends StatelessWidget {
  const Btn(
    this.label, {
    super.key,
    required this.onPressed,
    this.variant = BtnVariant.primary,
    this.loading = false,
    this.icon,
    this.small = false,
    this.block = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final BtnVariant variant;
  final bool loading;
  final IconData? icon;
  final bool small;
  final bool block;

  @override
  Widget build(BuildContext context) {
    final (fg, bg, pressed, side) = switch (variant) {
      BtnVariant.primary => (C.primaryFg, C.primary, C.primaryPressed, BorderSide.none),
      BtnVariant.secondary => (C.text, C.surface, C.surfaceMuted, const BorderSide(color: C.borderStrong)),
      BtnVariant.tertiary => (C.primary, Colors.transparent, C.primarySubtle, BorderSide.none),
      BtnVariant.danger => (C.danger, C.surface, C.dangerSubtle, const BorderSide(color: C.danger)),
    };
    final inactive = onPressed == null || loading;
    final button = Opacity(
      opacity: inactive ? 0.5 : 1,
      child: TextButton(
        onPressed: inactive
            ? null
            : () {
                HapticFeedback.selectionClick();
                onPressed!();
              },
        style: ButtonStyle(
          minimumSize: WidgetStatePropertyAll(Size(0, small ? 36 : 48)),
          padding: WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: small ? 16 : 24)),
          shape: WidgetStatePropertyAll(StadiumBorder(side: side)),
          backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.pressed) ? pressed : bg),
          overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
            else if (icon != null)
              Icon(icon, size: 20, color: fg),
            if (loading || icon != null) const SizedBox(width: 8),
            Flexible(
              child: Text(label,
                  textAlign: TextAlign.center,
                  style: T.label.copyWith(fontSize: small ? 14 : 16, color: fg)),
            ),
          ],
        ),
      ),
    );
    return Semantics(
      button: true,
      label: label,
      enabled: !inactive,
      excludeSemantics: true,
      child: block ? SizedBox(width: double.infinity, child: button) : button,
    );
  }
}

/// White card with a hairline border.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = EdgeInsets.zero, this.color = C.surface, this.borderColor = C.borderStrong});
  final Widget child;
  final EdgeInsets padding;
  final Color color;
  final Color borderColor;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor, width: 0.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: child,
      );
}

/// A tappable row inside a card: leading, title, subtitle, trailing, chevron.
class Tile extends StatelessWidget {
  const Tile({super.key, required this.title, this.subtitle, this.leading, this.trailing, this.onTap});
  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        highlightColor: C.surfaceMuted,
        splashColor: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: sp(4), vertical: sp(3)),
            child: Row(children: [
              if (leading != null) ...[leading!, SizedBox(width: sp(3))],
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: T.label, maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Text(subtitle!, style: T.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
                ]),
              ),
              if (trailing != null) ...[SizedBox(width: sp(3)), trailing!],
              if (onTap != null) ...[SizedBox(width: sp(2)), const Icon(Icons.chevron_right, size: 20, color: C.textMuted)],
            ]),
          ),
        ),
      );
}

class Divide extends StatelessWidget {
  const Divide({super.key});
  @override
  Widget build(BuildContext context) => const Divider(height: 0.5, thickness: 0.5, indent: 16, color: C.border);
}

/// Status pill.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral});
  final String label;
  final Tone tone;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(40)),
        child: Text(label, style: T.caption.copyWith(fontSize: 12, height: 18 / 12, color: tone.fg)),
      );
}

/// Inline alert (the RN Banner; Flutter already has a Banner widget).
class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.tone = Tone.danger, this.child});
  final String text;
  final Tone tone;
  final Widget? child;
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.all(sp(3)),
          decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(8)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.error_outline, size: 18, color: tone.fg),
            SizedBox(width: sp(2)),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(text, style: T.caption.copyWith(color: tone.fg)),
                if (child != null) ...[SizedBox(height: sp(2)), child!],
              ]),
            ),
          ]),
        ),
      );
}

/// Visible label above a TextFormField. Errors show after blur or submit (Form autovalidate onUnfocus).
class LabeledField extends StatefulWidget {
  const LabeledField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.placeholder,
    this.validator,
    this.serverError,
    this.secret = false,
    this.keyboardType,
    this.autofillHints,
    this.textInputAction,
    this.onSubmitted,
    this.minLines,
    this.maxLines = 1,
    this.maxLength,
    this.autofocus = false,
    this.onChanged,
    this.textCapitalization = TextCapitalization.none,
  });
  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? placeholder;
  final FormFieldValidator<String>? validator;
  final String? serverError;
  final bool secret;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final int? minLines;
  final int? maxLines;
  final int? maxLength;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final TextCapitalization textCapitalization;

  @override
  State<LabeledField> createState() => _LabeledFieldState();
}

class _LabeledFieldState extends State<LabeledField> {
  bool _shown = false;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.label, style: T.label),
          SizedBox(height: sp(1.5)),
          TextFormField(
            controller: widget.controller,
            validator: widget.validator,
            forceErrorText: widget.serverError,
            obscureText: widget.secret && !_shown,
            keyboardType: widget.keyboardType,
            autofillHints: widget.autofillHints,
            textInputAction: widget.textInputAction,
            onFieldSubmitted: widget.onSubmitted,
            onChanged: widget.onChanged,
            minLines: widget.minLines,
            maxLines: widget.secret ? 1 : widget.maxLines,
            maxLength: widget.maxLength,
            autofocus: widget.autofocus,
            textCapitalization: widget.textCapitalization,
            autocorrect: !widget.secret && widget.keyboardType != TextInputType.emailAddress,
            style: T.body,
            decoration: InputDecoration(
              helperText: widget.hint,
              hintText: widget.placeholder,
              counterText: '',
              suffixIcon: widget.secret
                  ? IconButton(
                      tooltip: _shown ? 'Hide password' : 'Show password',
                      icon: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: C.textMuted),
                      onPressed: () => setState(() => _shown = !_shown),
                    )
                  : null,
            ),
          ),
        ],
      );
}

/// Scrollable padded form body that keeps the focused input above the keyboard.
class FormBody extends StatelessWidget {
  const FormBody({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.all(sp(6)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: gap(children, sp(5))),
      );
}

/// Children separated by a fixed gap (RN's `gap`).
List<Widget> gap(List<Widget> children, double size) => [
      for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(height: size, width: size), children[i]],
    ];

/// Pulsing placeholder for content that takes longer than ~1s; static under reduced motion.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 72});
  final double height;
  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700), lowerBound: 0.5);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading',
        child: FadeTransition(
          opacity: _c,
          child: Container(
            height: widget.height,
            decoration: BoxDecoration(color: C.surfaceMuted, borderRadius: BorderRadius.circular(12)),
          ),
        ),
      );
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 4});
  final int rows;
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.all(sp(4)),
        child: Column(children: gap([for (var i = 0; i < rows; i++) const Skeleton()], sp(3))),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.symmetric(horizontal: sp(8), vertical: sp(12)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: gap([
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(color: C.primarySubtle, shape: BoxShape.circle),
              child: Icon(icon, size: 24, color: C.primary),
            ),
            Text(title, style: T.heading, textAlign: TextAlign.center),
            if (body != null) Text(body!, style: T.muted, textAlign: TextAlign.center),
            ?action,
          ], sp(3)),
        ),
      );
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry});
  final Object? error;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.cloud_off_outlined,
        title: "Couldn't load this",
        body: errorMessage(error),
        action: onRetry == null ? null : Btn('Try again', variant: BtnVariant.secondary, onPressed: onRetry),
      );
}

class Section extends StatelessWidget {
  const Section({super.key, required this.title, this.count, required this.children});
  final String title;
  final int? count;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: gap([
          Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            Semantics(header: true, child: Text(title, style: T.heading)),
            if (count != null) ...[SizedBox(width: sp(2)), Text('$count', style: T.caption)],
          ]),
          ...children,
        ], sp(3)),
      );
}

class Bullets extends StatelessWidget {
  const Bullets(this.items, {super.key});
  final List<String> items;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: gap([
          for (final t in items)
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('•', style: T.body.copyWith(color: C.primary)),
              SizedBox(width: sp(2)),
              Expanded(child: Text(t, style: T.body)),
            ]),
        ], sp(2)),
      );
}

/// Label/value pair in a summary grid.
class Stat extends StatelessWidget {
  const Stat(this.label, this.value, {super.key});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 120,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Eyebrow(label),
          SizedBox(height: sp(1)),
          Text(value, style: T.heading),
        ]),
      );
}

Future<R?> push<R>(BuildContext context, Widget screen, {bool fullscreenDialog = false}) =>
    Navigator.of(context, rootNavigator: true)
        .push<R>(MaterialPageRoute(builder: (_) => screen, fullscreenDialog: fullscreenDialog));

Future<void> alert(BuildContext context, String title, String body) => showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title, style: T.heading),
        content: Text(body, style: T.body),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
      ),
    );

/// Yes/no dialog; `destructive` paints the confirm action red.
Future<bool> confirmDialog(BuildContext context,
    {required String title, required String body, required String confirm, required String cancel, bool destructive = true}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title, style: T.heading),
      content: Text(body, style: T.body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(cancel)),
        TextButton(
          onPressed: () => Navigator.pop(c, true),
          child: Text(confirm, style: TextStyle(color: destructive ? C.danger : C.primary)),
        ),
      ],
    ),
  );
  return ok ?? false;
}
