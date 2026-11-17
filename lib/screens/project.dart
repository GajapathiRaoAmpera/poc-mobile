/// Project overview: header, Voice mode, the next-step (gate) card, Orchestrator chat and the stage pipeline.
library;

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';
import 'chat.dart';
import 'stage.dart';
import 'voice.dart';

const _busy = {'QUEUED', 'RUNNING'};

/// Workflow stages; polls while any stage is working.
Loader<List<Map<String, dynamic>>> workflowLoader(String id) {
  late final Loader<List<Map<String, dynamic>>> l;
  return l = Loader(
    () async => maps(await api('/projects/$id/workflow')),
    poll: () => l.data?.any((s) => _busy.contains(s['status'])) ?? false,
  );
}

/// Delivery thread state; polls while the Orchestrator runs.
Loader<Map<String, dynamic>> deliveryLoader(String id) {
  late final Loader<Map<String, dynamic>> l;
  return l = Loader(
    () async => (await api('/projects/$id/delivery')) as Map<String, dynamic>,
    poll: () => l.data?['status'] == 'RUNNING',
  );
}

class ProjectScreen extends StatefulWidget {
  const ProjectScreen({super.key, required this.id});
  final String id;
  @override
  State<ProjectScreen> createState() => _ProjectScreenState();
}

class _ProjectScreenState extends State<ProjectScreen> {
  late final _project = Loader(() async => (await api('/projects/${widget.id}')) as Map<String, dynamic>);
  late final _delivery = deliveryLoader(widget.id);
  late final _wf = workflowLoader(widget.id);

  @override
  void dispose() {
    _project.dispose();
    _delivery.dispose();
    _wf.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_project.load(), _delivery.load(), _wf.load()]);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: ListenableBuilder(
          listenable: Listenable.merge([_project, _delivery, _wf]),
          builder: (context, _) {
            final p = _project.data;
            final err = _project.error;
            if (err != null && p == null) {
              return err is ApiError && err.status == 404
                  ? const EmptyState(icon: Icons.help_outline, title: 'Project not found', body: 'It may have been deleted.')
                  : ErrorState(error: err, onRetry: _refresh);
            }
            final (label, tone) = projectStatus[p?['status']] ?? ('', Tone.neutral);
            return RefreshIndicator(
              color: C.primary,
              onRefresh: _refresh,
              child: ListView(
                padding: EdgeInsets.fromLTRB(sp(4), sp(1), sp(4), sp(10)),
                children: gap([
                  if (p == null)
                    const Skeleton(height: 64)
                  else
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap([
                      Text('${p['name']}', style: T.title),
                      if ((p['description'] as String?)?.isNotEmpty ?? false) Text(p['description'] as String, style: T.muted),
                      Row(children: [
                        Pill(label, tone: tone),
                        SizedBox(width: sp(3)),
                        Text('Updated ${relativeTime(p['updated_at'] as String? ?? '')}', style: T.caption),
                      ]),
                    ], sp(2))),
                  Semantics(
                    hint: 'Run the whole delivery by voice: hear updates, answer questions and approve drafts',
                    child: Btn('Voice mode',
                        icon: Icons.graphic_eq,
                        block: true,
                        onPressed: () => push(context, VoiceScreen(projectId: widget.id), fullscreenDialog: true)),
                  ),
                  if (_delivery.data != null)
                    GateCard(projectId: widget.id, delivery: _delivery.data!)
                  else if (_delivery.loading)
                    const Skeleton(height: 120),
                  Panel(
                    child: Tile(
                      leading: const Icon(Icons.forum_outlined, color: C.primary),
                      title: 'Project Orchestrator',
                      subtitle: 'Answer questions, add details or ask what happens next.',
                      onTap: () => push(context, ChatScreen(projectId: widget.id, channel: 'intake')),
                    ),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: gap([
                    Text('Stages', style: T.heading),
                    if (_wf.loading)
                      const Skeleton(height: 260)
                    else if (_wf.error != null && _wf.data == null)
                      ErrorState(error: _wf.error, onRetry: _wf.load)
                    else
                      StageList(projectId: widget.id, stages: _wf.data!),
                  ], sp(3))),
                ], sp(5)),
              ),
            );
          },
        ),
      );
}

const _resumable = {'needs_input', 'quota', 'failed', 'cancelled'};
const _nextTitle = {
  'approval': 'Review and approve the latest draft',
  'awaiting_answers': "Answer the Requirements Agent's open questions",
  'intake_questions': "Answer the Project Orchestrator's questions",
  'needs_input': 'More information is needed to continue',
  'quota': 'The AI service limit was reached',
  'failed': 'A stage failed — resume when ready',
  'cancelled': 'The workflow was cancelled',
};

/// What the delivery workflow is waiting for, and the one action that moves it on (mirrors the web GateCard).
class GateCard extends StatefulWidget {
  const GateCard({super.key, required this.projectId, required this.delivery});
  final String projectId;
  final Map<String, dynamic> delivery;
  @override
  State<GateCard> createState() => _GateCardState();
}

class _GateCardState extends State<GateCard> {
  bool _acting = false;

  Future<void> _act(String action) async {
    setState(() => _acting = true);
    try {
      await api('/projects/${widget.projectId}/delivery/$action', method: 'POST');
      refreshAll();
    } catch (e) {
      if (mounted) await alert(context, "Couldn't do that", errorMessage(e));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.delivery;
    final status = d['status'];
    final message = cleanMessage('${d['message'] ?? ''}');
    if (status == 'IDLE') return const SizedBox.shrink();

    if (status == 'RUNNING') {
      return _Card(
        color: C.surface,
        border: C.borderStrong,
        icon: const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
        eyebrow: 'Agents are working',
        title: 'No action needed right now',
        text: message,
        action: Btn('Cancel workflow',
            small: true,
            variant: BtnVariant.tertiary,
            loading: _acting,
            onPressed: () async {
              final ok = await confirmDialog(context,
                  title: 'Cancel the workflow?',
                  body: 'The current stage stops. You can resume later.',
                  confirm: 'Cancel workflow',
                  cancel: 'Keep running');
              if (ok) await _act('cancel');
            }),
      );
    }
    if (status == 'DONE') {
      return _Card(
        color: C.successSubtle,
        border: C.success,
        icon: const Icon(Icons.check_circle_outline, color: C.success),
        eyebrow: 'Workflow complete',
        title: 'All planned stages are approved',
        text: message,
      );
    }

    final pending = d['pending'] as Map<String, dynamic>?;
    final kind = pending?['kind'] as String?;
    final stage = gateStage(d);
    final pid = widget.projectId;
    Widget? action;
    if (kind == 'approval' && stage != null && stage != 'orchestrator') {
      action = Btn('Review $stage', small: true, onPressed: () => push(context, StageScreen(projectId: pid, stage: stage)));
    } else if (kind == 'awaiting_answers') {
      action = Btn('Answer open questions',
          small: true, onPressed: () => push(context, StageScreen(projectId: pid, stage: 'requirements')));
    } else if (kind == 'intake_questions') {
      final qs = maps((pending?['payload'] as Map?)?['questions']);
      action = Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap([
        for (final q in qs)
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('•', style: T.body.copyWith(color: C.primary)),
            SizedBox(width: sp(2)),
            Expanded(child: Text('${q['question']}', style: T.body)),
          ]),
        Btn('Reply to the Orchestrator',
            small: true, onPressed: () => push(context, ChatScreen(projectId: pid, channel: 'intake'))),
      ], sp(2)));
    } else if (kind != null && _resumable.contains(kind)) {
      action = Btn('Resume workflow', small: true, loading: _acting, onPressed: () => _act('resume'));
    }
    return _Card(
      color: C.primarySubtle,
      border: C.primary,
      icon: const Icon(Icons.pause_circle_outline, color: C.primary),
      eyebrow: 'Your next step',
      title: _nextTitle[kind] ?? 'The workflow is waiting for you',
      text: message,
      action: action,
    );
  }
}

class _Card extends StatelessWidget {
  const _Card(
      {required this.color, required this.border, required this.icon, required this.eyebrow, required this.title, required this.text, this.action});
  final Color color;
  final Color border;
  final Widget icon;
  final String eyebrow;
  final String title;
  final String text;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: EdgeInsets.all(sp(4)),
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap([
            Row(children: [icon, SizedBox(width: sp(2)), Eyebrow(eyebrow)]),
            Text(title, style: T.heading),
            if (text.isNotEmpty) Text(text, style: T.muted),
            if (action != null) Padding(padding: EdgeInsets.only(top: sp(2)), child: action),
          ], sp(2))),
        ),
      );
}

const _hidden = {'UNAVAILABLE', 'NOT_PLANNED'};

/// The delivery pipeline: one row per stage, tappable once it has something to show.
class StageList extends StatelessWidget {
  const StageList({super.key, required this.projectId, required this.stages});
  final String projectId;
  final List<Map<String, dynamic>> stages;
  @override
  Widget build(BuildContext context) {
    final shown = stages.where((s) => !_hidden.contains(s['status'])).toList();
    return Panel(
      child: shown.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text("The Project Orchestrator hasn't planned any stages yet.", style: T.muted),
            )
          : Column(children: [
              for (final (i, s) in shown.indexed) ...[
                if (i > 0) const Divide(),
                _stageRow(context, i, s),
              ],
            ]),
    );
  }

  Widget _stageRow(BuildContext context, int i, Map<String, dynamic> s) {
    final (label, tone) = stageStatus[s['status']] ?? ('', Tone.neutral);
    final artifact = s['artifact'] as Map<String, dynamic>?;
    final rev = artifact?['latest_revision'];
    final openable = artifact != null || _busy.contains(s['status']);
    final reasons = strings(s['reasons']);
    final stage = s['stage'] as String;
    return Tile(
      leading: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: tone.bg, shape: BoxShape.circle),
        child: Text('${i + 1}', style: T.label.copyWith(color: tone.fg)),
      ),
      title: stageLabel[stage] ?? stage,
      subtitle: rev != null
          ? 'Revision $rev${artifact?['approved_revision'] == rev ? ' · approved' : ''}'
          : (reasons.isEmpty ? null : reasons.first),
      trailing: Pill(label, tone: tone),
      onTap: openable ? () => push(context, StageScreen(projectId: projectId, stage: stage)) : null,
    );
  }
}
