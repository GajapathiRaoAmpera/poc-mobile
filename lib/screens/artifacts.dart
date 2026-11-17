/// Read-only views of each stage's artifact (JSON shapes: poc-backend app/modules/agents/*/schema.py).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';

List<Widget> artifactBody(String projectId, String stage, Map<String, dynamic> revision) {
  final content = (revision['content'] as Map<String, dynamic>?) ?? const {};
  return switch (stage) {
    'requirements' => requirementsView(projectId, revision['revision'] as int, content),
    'architecture' => architectureView(content),
    'plan' => planView(content),
    'budget' => budgetView(content),
    'code' => codeView(content),
    _ => const [],
  };
}

Widget _card(List<Widget> children, {Color? color, Color? border}) => Panel(
      padding: EdgeInsets.all(sp(4)),
      color: color ?? C.surface,
      borderColor: border ?? C.borderStrong,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap(children, sp(2))),
    );

Tone _levelTone(Object? level) => switch (level) { 'high' => Tone.danger, 'medium' => Tone.warning, _ => Tone.neutral };

// ---- Requirements ----

const _priorityTone = {'MUST': Tone.primary, 'SHOULD': Tone.info, 'COULD': Tone.neutral, 'WONT': Tone.neutral};
const _order = ['MUST', 'SHOULD', 'COULD', 'WONT'];

List<Widget> requirementsView(String projectId, int revision, Map<String, dynamic> c) {
  final reqs = maps(c['requirements'])..sort((a, b) => _order.indexOf('${a['priority']}').compareTo(_order.indexOf('${b['priority']}')));
  final goals = strings(c['goals']);
  final personas = maps(c['personas']);
  final risks = maps(c['risks']);
  final assumptions = strings(c['assumptions']);
  return [
    if (maps(c['open_questions']).isNotEmpty)
      OpenQuestions(key: ValueKey(revision), projectId: projectId, revision: revision, questions: maps(c['open_questions'])),
    if (goals.isNotEmpty) Section(title: 'Goals', children: [Bullets(goals)]),
    Section(title: 'Requirements', count: reqs.length, children: [
      for (final r in reqs)
        _card([
          Wrap(spacing: sp(2), runSpacing: sp(1), crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text('${r['id']}', style: T.mono.copyWith(color: C.textMuted)),
            Pill('${r['priority']}', tone: _priorityTone[r['priority']] ?? Tone.neutral),
            if (r['type'] == 'non_functional') const Pill('Non-functional'),
          ]),
          Text('${r['title']}', style: T.label),
          Text('${r['description']}', style: T.muted),
          if (strings(r['acceptance_criteria']).isNotEmpty) ...[
            const Eyebrow('Acceptance criteria'),
            Bullets(strings(r['acceptance_criteria'])),
          ],
        ]),
    ]),
    if (personas.isNotEmpty)
      Section(title: "Who it's for", children: [
        for (final p in personas)
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p['name']}', style: T.label),
            Text('${p['description']}', style: T.muted),
          ]),
      ]),
    if (risks.isNotEmpty)
      Section(title: 'Risks', children: [
        for (final r in risks)
          _card([
            Pill('${r['likelihood']} likelihood', tone: _levelTone(r['likelihood'])),
            Text('${r['description']}', style: T.body),
            Text('Mitigation: ${r['mitigation']}', style: T.caption),
          ]),
      ]),
    if (assumptions.isNotEmpty) Section(title: 'Assumptions', children: [Bullets(assumptions)]),
  ];
}

class OpenQuestions extends StatefulWidget {
  const OpenQuestions({super.key, required this.projectId, required this.revision, required this.questions});
  final String projectId;
  final int revision;
  final List<Map<String, dynamic>> questions;
  @override
  State<OpenQuestions> createState() => _OpenQuestionsState();
}

class _OpenQuestionsState extends State<OpenQuestions> {
  late final _answers = {
    for (final q in widget.questions) '${q['id']}': TextEditingController(text: q['answer'] as String? ?? ''),
  };
  bool _busy = false;

  @override
  void dispose() {
    for (final c in _answers.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _changed => widget.questions.any((q) => _answers['${q['id']}']!.text != (q['answer'] as String? ?? ''));

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await api('/projects/${widget.projectId}/artifacts/requirements/answers', method: 'PUT', json: {
        'base_revision': widget.revision,
        'answers': {for (final e in _answers.entries) e.key: e.value.text.trim().isEmpty ? null : e.value.text.trim()},
      });
      refreshAll();
      if (mounted) await alert(context, 'Answers saved', 'The Requirements Agent will use them in the next draft.');
    } catch (e) {
      if (mounted) await alert(context, "Couldn't save answers", errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unanswered = widget.questions.where((q) => q['answer'] == null || q['answer'] == '').length;
    return Section(title: 'Open questions', count: unanswered == 0 ? null : unanswered, children: [
      for (final q in widget.questions)
        _card(
          [
            if (q['blocking'] == true || (q['answer'] ?? '') != '')
              Wrap(spacing: sp(2), children: [
                if (q['blocking'] == true) const Pill('Blocking', tone: Tone.warning),
                if ((q['answer'] ?? '') != '') const Pill('Answered', tone: Tone.success),
              ]),
            Text('${q['question']}', style: T.label),
            Text('${q['why_it_matters']}', style: T.caption),
            TextField(
              controller: _answers['${q['id']}'],
              minLines: 1,
              maxLines: 6,
              maxLength: 2000,
              style: T.body,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(hintText: 'Your answer', counterText: '', semanticCounterText: 'Answer: ${q['question']}'),
            ),
          ],
          border: q['blocking'] == true && (q['answer'] ?? '') == '' ? C.warning : null,
        ),
      Btn('Save answers', block: true, loading: _busy, onPressed: _changed ? _save : null),
    ]);
  }
}

// ---- Architecture ----

/// The diagram as lists: components by group, then connections and decisions. The canvas stays on the web.
List<Widget> architectureView(Map<String, dynamic> c) {
  final nodes = maps(c['nodes']);
  final edges = maps(c['edges']);
  final decisions = maps(c['decisions']);
  final names = {for (final n in nodes) n['id']: '${n['label']}'};
  final groupLabel = {for (final g in maps(c['groups'])) g['id']: '${g['label']}'};
  final byGroup = <String, List<Map<String, dynamic>>>{};
  for (final n in nodes) {
    final key = n['group'] != null ? (groupLabel[n['group']] ?? '${n['group']}') : 'Components';
    (byGroup[key] ??= []).add(n);
  }
  return [
    for (final MapEntry(key: group, value: list) in byGroup.entries)
      Section(title: group, count: list.length, children: [
        for (final n in list)
          _card([
            Wrap(spacing: sp(2), runSpacing: sp(1), crossAxisAlignment: WrapCrossAlignment.center, children: [
              Pill('${n['type']}'.replaceFirst('_', ' '), tone: Tone.primary),
              if ((n['technology'] ?? '') != '') Text('${n['technology']}', style: T.mono.copyWith(color: C.textMuted)),
            ]),
            Text('${n['label']}', style: T.label),
            if ((n['description'] ?? '') != '') Text('${n['description']}', style: T.muted),
            if (strings(n['responsibilities']).isNotEmpty) Bullets(strings(n['responsibilities'])),
          ]),
      ]),
    if (edges.isNotEmpty)
      Section(title: 'Connections', count: edges.length, children: [
        Panel(
          child: Column(children: [
            for (final (i, e) in edges.indexed)
              Container(
                width: double.infinity,
                padding: EdgeInsets.symmetric(horizontal: sp(4), vertical: sp(3)),
                decoration: BoxDecoration(border: i > 0 ? const Border(top: BorderSide(color: C.border, width: 0.5)) : null),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: sp(2), children: [
                    Text(names[e['source']] ?? '${e['source']}', style: T.label),
                    const Icon(Icons.arrow_forward, size: 16, color: C.textMuted),
                    Text(names[e['target']] ?? '${e['target']}', style: T.label),
                  ]),
                  if ((e['label'] ?? '') != '' || (e['protocol'] ?? '') != '')
                    Text([e['label'], e['protocol']].where((s) => s != null && s != '').join(' · '), style: T.caption),
                ]),
              ),
          ]),
        ),
      ]),
    if (decisions.isNotEmpty)
      Section(title: 'Decisions', count: decisions.length, children: [
        for (final d in decisions)
          _card([
            Text('${d['title']}', style: T.label),
            Text('${d['decision']}', style: T.body),
            if ((d['rationale'] ?? '') != '') Text('Why: ${d['rationale']}', style: T.caption),
            if (strings(d['alternatives']).isNotEmpty) Text('Considered: ${strings(d['alternatives']).join(', ')}', style: T.caption),
          ]),
      ]),
  ];
}

// ---- Plan ----

List<Widget> planView(Map<String, dynamic> c) {
  final schedule = (c['schedule'] as Map<String, dynamic>?) ?? const {};
  final tasks = maps(c['tasks']);
  final milestones = maps(c['milestones']);
  final risks = maps(c['risks']);
  final warnings = strings(c['warnings']);
  final target = schedule['target_date'] as String?;
  return [
    Panel(
      padding: EdgeInsets.all(sp(4)),
      child: Wrap(spacing: sp(4), runSpacing: sp(4), children: [
        Stat('Starts', formatDay('${schedule['start']}')),
        Stat('Ends', formatDay('${schedule['end']}')),
        Stat('Working days', '${schedule['working_days']}'),
      ]),
    ),
    if (target != null)
      Text('Target date: ${formatDay(target)}${'${schedule['end']}'.compareTo(target) > 0 ? ' — the plan runs past it' : ''}',
          style: T.caption),
    if (warnings.isNotEmpty) _card([Bullets(warnings)], color: C.warningSubtle, border: C.warning),
    Section(title: 'Milestones', count: milestones.length, children: [
      for (final (i, m) in milestones.indexed)
        _card([
          Row(children: [
            Pill('M${i + 1}', tone: Tone.primary),
            SizedBox(width: sp(2)),
            Text('${formatDay('${m['start']}')} – ${formatDay('${m['end']}')}', style: T.caption),
          ]),
          Text('${m['title']}', style: T.label),
          Text('${m['goal']}', style: T.muted),
          for (final t in tasks.where((t) => t['milestone_id'] == m['id']))
            Container(
              padding: EdgeInsets.only(top: sp(3)),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: C.border, width: 0.5))),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${t['title']}', style: T.body),
                    Text('${roleLabel('${t['role']}')} · ${formatDay('${t['start']}')} – ${formatDay('${t['end']}')}',
                        style: T.caption),
                  ]),
                ),
                SizedBox(width: sp(3)),
                Text('${t['effort_days']}d', style: T.mono.copyWith(color: C.textMuted)),
              ]),
            ),
        ]),
    ]),
    if (risks.isNotEmpty)
      Section(title: 'Risks', children: [
        for (final r in risks)
          _card([
            Pill('${r['impact']} impact', tone: _levelTone(r['impact'])),
            Text('${r['description']}', style: T.body),
            Text('Mitigation: ${r['mitigation']}', style: T.caption),
          ]),
      ]),
  ];
}

// ---- Budget ----

Widget _line(String label, String value, {String? detail}) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: T.body),
          if (detail != null) Text(detail, style: T.caption),
        ]),
      ),
      SizedBox(width: sp(3)),
      Text(value, style: T.label.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
    ]);

List<Widget> budgetView(Map<String, dynamic> c) {
  final currency = '${c['currency'] ?? 'USD'}';
  String money(Object? a) => formatMoney(a, currency);
  final labour = (c['labour'] as Map<String, dynamic>?) ?? const {};
  final items = maps(c['items']);
  final warnings = strings(c['warnings']);
  return [
    _card([
      const Eyebrow('Estimated total'),
      Padding(
        padding: EdgeInsets.only(bottom: sp(2)),
        child: Text(money(c['total']), style: T.display.copyWith(color: C.primary)),
      ),
      _line('Labour', money(labour['total'])),
      _line('Other costs', money(c['non_labour'])),
      _line('Contingency (${c['contingency_pct']}%)', money(c['contingency'])),
      if ((c['contingency_reason'] ?? '') != '') Text('${c['contingency_reason']}', style: T.caption),
    ], color: C.primarySubtle, border: C.primary),
    if (warnings.isNotEmpty) _card([Bullets(warnings)], color: C.warningSubtle, border: C.warning),
    Section(title: 'Labour by role', children: [
      _card([
        for (final r in maps(labour['by_role'])) _line(roleLabel('${r['role']}'), money(r['cost']), detail: '${r['days']} days'),
      ]),
    ]),
    Section(title: 'Labour by milestone', children: [
      _card([for (final m in maps(labour['by_milestone'])) _line('${m['title']}', money(m['cost']), detail: '${m['days']} days')]),
    ]),
    if (items.isNotEmpty)
      Section(title: 'Other costs', children: [
        _card([
          for (final it in items)
            _line('${it['description']}', money(it['amount']),
                detail: it['recurrence'] == 'monthly' ? 'Monthly × ${c['months']}' : 'One-off'),
        ]),
      ]),
  ];
}

// ---- Code (scaffold) ----

/// Read-only scaffold: checks, next steps and each file's contents. Downloading the script stays on the web.
List<Widget> codeView(Map<String, dynamic> c) {
  final report = (c['report'] as Map<String, dynamic>?) ?? const {};
  final findings = maps(report['findings']);
  final errors = findings.where((f) => f['level'] == 'error').length;
  final files = maps(c['files']);
  final nextSteps = strings(c['next_steps']);
  return [
    _card([
      Wrap(spacing: sp(2), runSpacing: sp(1), children: [
        Pill('bash -n ${report['bash_n']}', tone: report['bash_n'] == 'ok' ? Tone.success : Tone.danger),
        Pill('shellcheck ${report['shellcheck']}',
            tone: switch (report['shellcheck']) { 'ok' => Tone.success, 'failed' => Tone.danger, _ => Tone.neutral }),
        if (findings.isNotEmpty)
          Pill('${findings.length} finding${findings.length == 1 ? '' : 's'}', tone: errors > 0 ? Tone.danger : Tone.warning),
      ]),
      Text('Download and run the scaffold script from the web app.', style: T.caption),
    ]),
    if (nextSteps.isNotEmpty) Section(title: 'Next steps', children: [Bullets(nextSteps)]),
    Section(title: 'Files', count: files.length, children: [
      Panel(
        child: Column(children: [
          for (final (i, f) in files.indexed) _FileRow(key: ValueKey(f['path']), file: f, first: i == 0),
        ]),
      ),
    ]),
  ];
}

class _FileRow extends StatefulWidget {
  const _FileRow({super.key, required this.file, required this.first});
  final Map<String, dynamic> file;
  final bool first;
  @override
  State<_FileRow> createState() => _FileRowState();
}

class _FileRowState extends State<_FileRow> {
  bool _open = false;
  @override
  Widget build(BuildContext context) {
    final path = '${widget.file['path']}';
    final content = '${widget.file['content'] ?? ''}';
    return Container(
      decoration: BoxDecoration(border: widget.first ? null : const Border(top: BorderSide(color: C.border, width: 0.5))),
      child: Column(children: [
        Semantics(
          expanded: _open,
          child: InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: EdgeInsets.symmetric(horizontal: sp(4)),
              child: Row(children: [
                const Icon(Icons.description_outlined, size: 18, color: C.primary),
                SizedBox(width: sp(3)),
                Expanded(child: Text(path, style: T.mono, maxLines: 1, overflow: TextOverflow.ellipsis)),
                Icon(_open ? Icons.expand_more : Icons.chevron_right, size: 20, color: C.textMuted),
              ]),
            ),
          ),
        ),
        if (_open)
          Container(
            margin: EdgeInsets.fromLTRB(sp(3), 0, sp(3), sp(3)),
            decoration: BoxDecoration(color: C.surfaceMuted, borderRadius: BorderRadius.circular(8)),
            child: Stack(children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.fromLTRB(sp(3), sp(3), sp(10), sp(3)),
                child: SelectableText(content, style: T.mono.copyWith(fontSize: 12, height: 1.5)),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: IconButton(
                  tooltip: 'Copy $path',
                  icon: const Icon(Icons.copy, size: 16, color: C.textMuted),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: content));
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Copied $path')));
                  },
                ),
              ),
            ]),
          ),
      ]),
    );
  }
}
