/// Signed-in shell: Home, Projects and Account tabs, plus change password.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';
import 'auth.dart';
import 'new_project.dart';
import 'project.dart';

class TabsShell extends StatefulWidget {
  const TabsShell({super.key});
  @override
  State<TabsShell> createState() => _TabsShellState();
}

class _TabsShellState extends State<TabsShell> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(index: _tab, children: [
          HomeTab(onSeeAll: () => setState(() => _tab = 1)),
          const ProjectsTab(),
          const AccountTab(),
        ]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: 'Projects'),
            NavigationDestination(
                icon: Icon(Icons.account_circle_outlined), selectedIcon: Icon(Icons.account_circle), label: 'Account'),
          ],
        ),
      );
}

/// Large left-aligned tab title, like the iOS large-title headers of the RN app.
PreferredSizeWidget tabBar(String title, {List<Widget>? actions, PreferredSizeWidget? bottom}) => AppBar(
      centerTitle: false,
      toolbarHeight: 64,
      title: Text(title, style: T.title.copyWith(fontSize: 30, height: 1.2)),
      actions: actions,
      bottom: bottom,
    );

class ProjectCard extends StatelessWidget {
  const ProjectCard(this.project, {super.key});
  final Map<String, dynamic> project;
  @override
  Widget build(BuildContext context) {
    final (label, tone) = projectStatus[project['status']] ?? ('—', Tone.neutral);
    final updated = relativeTime(project['updated_at'] as String? ?? '');
    final description = project['description'] as String?;
    return Semantics(
      button: true,
      label: '${project['name']}, $label, updated $updated',
      excludeSemantics: true,
      child: Material(
        color: C.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: C.borderStrong, width: 0.5)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          highlightColor: C.surfaceMuted,
          splashColor: Colors.transparent,
          onTap: () => push(context, ProjectScreen(id: project['id'] as String)),
          child: Padding(
            padding: EdgeInsets.all(sp(4)),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Pill(label, tone: tone), Text(updated, style: T.caption)]),
                  SizedBox(height: sp(1.5)),
                  Text('${project['name']}', style: T.heading, maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (description != null && description.isNotEmpty) ...[
                    SizedBox(height: sp(1.5)),
                    Text(description, style: T.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ]),
              ),
              SizedBox(width: sp(3)),
              const Icon(Icons.chevron_right, color: C.textMuted),
            ]),
          ),
        ),
      ),
    );
  }
}

class HomeTab extends StatefulWidget {
  const HomeTab({super.key, required this.onSeeAll});
  final VoidCallback onSeeAll;
  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  static const _recent = 5;
  final _projects = Loader(() async => (await api('/projects?page_size=$_recent')) as Map<String, dynamic>);

  @override
  void dispose() {
    _projects.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final first = (session.user?['name'] as String?)?.split(' ').first;
    return Scaffold(
      appBar: tabBar('Home'),
      body: RefreshIndicator(
        color: C.primary,
        onRefresh: _projects.load,
        child: ListenableBuilder(
          listenable: _projects,
          builder: (context, _) {
            final p = _projects;
            final items = maps(p.data?['items']);
            return ListView(
              padding: EdgeInsets.fromLTRB(sp(4), sp(2), sp(4), sp(10)),
              children: gap([
                Text(first != null && first.isNotEmpty ? 'Hi $first' : 'Hi there', style: T.display),
                _Hero(onTap: () => push(context, const NewProjectScreen(), fullscreenDialog: true)),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Recent projects', style: T.heading),
                  if (((p.data?['total'] as num?) ?? 0) > _recent)
                    Btn('See all', small: true, variant: BtnVariant.tertiary, onPressed: widget.onSeeAll),
                ]),
                if (p.loading)
                  const SkeletonList(rows: 3)
                else if (p.error != null && !p.hasData)
                  ErrorState(error: p.error, onRetry: p.load)
                else if (items.isEmpty)
                  const EmptyState(
                      icon: Icons.folder_open_outlined, title: 'No projects yet', body: 'Your projects show up here once you start one.')
                else
                  Column(children: gap([for (final it in items) ProjectCard(it)], sp(3))),
              ], sp(5)),
            );
          },
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Start a new project',
        excludeSemantics: true,
        child: Material(
          color: C.navy,
          borderRadius: BorderRadius.circular(16),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: EdgeInsets.all(sp(5)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap([
                const Icon(Icons.auto_awesome, color: C.cream),
                Text('Start a new project', style: T.title.copyWith(color: C.cream)),
                Text(
                  'Describe what you want to build. The Project Orchestrator plans the work and the agents draft each stage for your review.',
                  style: T.body.copyWith(color: C.cream.withValues(alpha: 0.78)),
                ),
                Row(children: [
                  Text('Describe your idea', style: T.label.copyWith(color: C.cream)),
                  SizedBox(width: sp(2)),
                  const Icon(Icons.arrow_forward, size: 18, color: C.cream),
                ]),
              ], sp(2))),
            ),
          ),
        ),
      );
}

class ProjectsTab extends StatefulWidget {
  const ProjectsTab({super.key});
  @override
  State<ProjectsTab> createState() => _ProjectsTabState();
}

class _ProjectsTabState extends State<ProjectsTab> {
  static const _filters = [('All', null), ('Active', 'ACTIVE'), ('Draft', 'DRAFT'), ('Archived', 'ARCHIVED')];
  String _q = '';
  String? _status;
  Timer? _debounce;
  // shortcut: first 100 projects only (backend max page size); add paging when users exceed that.
  late final _projects = Loader(() async {
    final qs = Uri(queryParameters: {'page_size': '100', if (_q.isNotEmpty) 'q': _q, 'status': ?_status}).query;
    return (await api('/projects?$qs')) as Map<String, dynamic>;
  });

  @override
  void dispose() {
    _debounce?.cancel();
    _projects.dispose();
    super.dispose();
  }

  void _setStatus(String? s) {
    setState(() => _status = s);
    _projects.load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: tabBar(
          'Projects',
          actions: [
            IconButton(
              tooltip: 'New project',
              icon: const Icon(Icons.add, size: 28),
              onPressed: () => push(context, const NewProjectScreen(), fullscreenDialog: true),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(60),
            child: Padding(
              padding: EdgeInsets.fromLTRB(sp(4), 0, sp(4), sp(3)),
              child: TextField(
                style: T.body,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search projects',
                  prefixIcon: const Icon(Icons.search, color: C.textMuted),
                  fillColor: C.surfaceMuted,
                  contentPadding: EdgeInsets.zero,
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: C.primary)),
                ),
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 300), () {
                    _q = v.trim();
                    _projects.load();
                  });
                },
              ),
            ),
          ),
        ),
        body: RefreshIndicator(
          color: C.primary,
          onRefresh: _projects.load,
          child: ListenableBuilder(
            listenable: _projects,
            builder: (context, _) {
              final p = _projects;
              final items = maps(p.data?['items']);
              final filtered = _q.isNotEmpty || _status != null;
              return ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.fromLTRB(sp(4), sp(1), sp(4), sp(10)),
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(children: gap([
                      for (final (label, value) in _filters)
                        ChoiceChip(
                          label: Text(label),
                          selected: _status == value,
                          showCheckmark: false,
                          onSelected: (_) => _setStatus(value),
                          labelStyle: T.label.copyWith(color: _status == value ? C.surface : C.text),
                          selectedColor: C.text,
                          backgroundColor: C.surface,
                          side: BorderSide(color: _status == value ? C.text : C.borderStrong),
                          shape: const StadiumBorder(),
                        ),
                    ], sp(2))),
                  ),
                  SizedBox(height: sp(4)),
                  if (p.loading)
                    const SkeletonList()
                  else if (p.error != null && !p.hasData)
                    ErrorState(error: p.error, onRetry: p.load)
                  else if (items.isEmpty && filtered)
                    EmptyState(
                      icon: Icons.search_off,
                      title: 'No matching projects',
                      body: 'Try a different search or filter.',
                      action: _status != null
                          ? Btn('Show all statuses', variant: BtnVariant.secondary, onPressed: () => _setStatus(null))
                          : null,
                    )
                  else if (items.isEmpty)
                    EmptyState(
                      icon: Icons.folder_open_outlined,
                      title: 'No projects yet',
                      body: 'Describe an idea and the agents will plan it with you.',
                      action: Btn('Start a project',
                          onPressed: () => push(context, const NewProjectScreen(), fullscreenDialog: true)),
                    )
                  else
                    ...gap([for (final it in items) ProjectCard(it, key: ValueKey(it['id']))], sp(3)),
                ],
              );
            },
          ),
        ),
      );
}

class AccountTab extends StatelessWidget {
  const AccountTab({super.key});

  @override
  Widget build(BuildContext context) {
    final user = session.user;
    final name = user?['name'] as String?;
    final initials = (name ?? '?').trim().split(RegExp(r'\s+')).take(2).map((w) => w.isEmpty ? '' : w[0].toUpperCase()).join();
    return Scaffold(
      appBar: tabBar('Account'),
      body: ListView(
        padding: EdgeInsets.all(sp(4)),
        children: gap([
          Row(children: [
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: C.primarySubtle, shape: BoxShape.circle),
              child: Text(initials, style: T.heading.copyWith(color: C.primary)),
            ),
            SizedBox(width: sp(4)),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name ?? 'Your account', style: T.heading),
                if (user != null) Text('${user['email']}', style: T.caption),
              ]),
            ),
          ]),
          Panel(
            child: Column(children: [
              Tile(
                leading: const Icon(Icons.key_outlined, color: C.primary),
                title: 'Change password',
                onTap: () => push(context, const ChangePasswordScreen()),
              ),
              const Divide(),
              const Tile(
                leading: Icon(Icons.open_in_new, color: C.primary),
                title: 'Open the web app',
                subtitle: 'Edit specifications, the architecture canvas and plans on a larger screen.',
                onTap: openWeb,
              ),
            ]),
          ),
          Panel(
            child: Tile(
              leading: const Icon(Icons.logout, color: C.danger),
              title: 'Sign out',
              onTap: () async {
                final ok = await confirmDialog(context,
                    title: 'Sign out?',
                    body: "You'll need your email and password to sign in again.",
                    confirm: 'Sign out',
                    cancel: 'Cancel');
                if (ok) await session.signOut();
              },
            ),
          ),
        ], sp(5)),
      ),
    );
  }
}

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  Map<String, String> _fields = {};
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _fields = {});
    if (!_form.currentState!.validate() || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await api('/auth/change-password',
          method: 'POST', json: {'current_password': _current.text, 'new_password': _next.text});
      if (!mounted) return;
      await alert(context, 'Password changed', 'Other devices have been signed out.');
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final fields = Map.fromEntries(
          fieldErrors(e).entries.where((f) => f.key == 'current_password' || f.key == 'new_password'));
      if (mounted) {
        setState(() {
          _fields = fields;
          _error = fieldErrors(e).isEmpty ? errorMessage(e) : null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Change password')),
        body: Form(
          key: _form,
          autovalidateMode: AutovalidateMode.onUnfocus,
          child: FormBody(children: [
            if (_error != null) Notice(_error!),
            LabeledField(
              label: 'Current password',
              controller: _current,
              secret: true,
              serverError: _fields['current_password'],
              autofillHints: const [AutofillHints.password],
              validator: (v) => (v ?? '').isEmpty ? 'Enter your current password' : null,
            ),
            LabeledField(
              label: 'New password',
              hint: 'At least 10 characters',
              controller: _next,
              secret: true,
              serverError: _fields['new_password'],
              autofillHints: const [AutofillHints.newPassword],
              validator: validateNewPassword,
            ),
            LabeledField(
              label: 'Confirm new password',
              controller: _confirm,
              secret: true,
              onSubmitted: (_) => _submit(),
              validator: (v) => v == _next.text ? null : "Passwords don't match",
            ),
            Btn('Change password', block: true, loading: _busy, onPressed: _submit),
          ]),
        ),
      );
}
