/// One stage's latest draft (read-only), with the approve / request-changes bar while it awaits review.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../ui/kit.dart';
import 'artifacts.dart';
import 'chat.dart';
import 'project.dart';

class StageScreen extends StatefulWidget {
  const StageScreen({super.key, required this.projectId, required this.stage});
  final String projectId;
  final String stage;
  @override
  State<StageScreen> createState() => _StageScreenState();
}

class _StageScreenState extends State<StageScreen> {
  late final _wf = workflowLoader(widget.projectId);
  late final _artifact = Loader(
    () async => (await api('/projects/${widget.projectId}/artifacts/${widget.stage}')) as Map<String, dynamic>,
    poll: () => _working,
  );
  bool _wasWorking = false;

  Map<String, dynamic>? get _state => _wf.data?.where((s) => s['stage'] == widget.stage).firstOrNull;
  bool get _working => const {'RUNNING', 'QUEUED'}.contains(_state?['status']);

  @override
  void initState() {
    super.initState();
    _wf.addListener(_onWorkflow);
  }

  // Start polling the artifact while its agent works; the last poll can land just before the run
  // finishes, so fetch once more when it stops.
  void _onWorkflow() {
    if (_working) {
      _artifact.schedule();
    } else if (_wasWorking) {
      _artifact.load();
    }
    _wasWorking = _working;
  }

  @override
  void dispose() {
    _wf.dispose();
    _artifact.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_wf.load(), _artifact.load()]);

  @override
  Widget build(BuildContext context) {
    final agent = agents[widget.stage]!;
    return Scaffold(
      appBar: AppBar(
        title: Text(stageLabel[widget.stage] ?? widget.stage),
        actions: [
          IconButton(
            tooltip: 'Chat with the ${agent.name}',
            icon: const Icon(Icons.forum_outlined),
            onPressed: () => push(context, ChatScreen(projectId: widget.projectId, channel: widget.stage)),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: Listenable.merge([_wf, _artifact]),
        builder: (context, _) {
          final state = _state;
          final art = _artifact.data;
          final rev = art?['revision'] as Map<String, dynamic>?;
          final meta = stageStatus[state?['status']];
          final reviewable = state?['status'] == 'WAITING_FOR_APPROVAL' && rev != null && rev['revision'] == art?['latest_revision'];
          final err = _artifact.error;
          final noArtifact = err is ApiError && err.status == 404;
          final run = state?['latest_run'] as Map<String, dynamic>?;
          final runError = run?['status'] == 'FAILED' ? run!['error'] as Map<String, dynamic>? : null;

          return Column(children: [
            Expanded(
              child: RefreshIndicator(
                color: C.primary,
                onRefresh: _refresh,
                child: ListView(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: EdgeInsets.fromLTRB(sp(4), sp(1), sp(4), sp(10)),
                  children: gap([
                    if (meta != null)
                      Row(children: [
                        Pill(meta.$1, tone: meta.$2),
                        if (rev != null) ...[
                          SizedBox(width: sp(3)),
                          Text('Revision ${rev['revision']} · ${relativeTime(rev['created_at'] as String? ?? '')}', style: T.caption),
                        ],
                      ]),
                    if (_working)
                      Panel(
                        padding: EdgeInsets.all(sp(4)),
                        child: Row(children: [
                          const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)),
                          SizedBox(width: sp(3)),
                          Expanded(
                            child: Text(
                                "The ${agent.name} is working on a new draft. This page updates when it's ready.",
                                style: T.body),
                          ),
                        ]),
                      ),
                    if (art?['stale'] == true)
                      Notice('${art?['stale_reason'] ?? 'An input changed since this was drafted.'}', tone: Tone.info),
                    if (runError != null) Notice(cleanMessage('${runError['message']}')),
                    if (_artifact.loading)
                      const SkeletonList()
                    else if (noArtifact || rev == null)
                      if (!_working)
                        EmptyState(
                          icon: Icons.help_outline,
                          title: 'Nothing here yet',
                          body: "The ${agent.name} hasn't produced a draft yet.",
                        )
                      else
                        const SizedBox.shrink()
                    else if (err != null && art == null)
                      ErrorState(error: err, onRetry: _refresh)
                    else ...[
                      if ((rev['summary'] as String?)?.isNotEmpty ?? false) Text(cleanMessage(rev['summary'] as String), style: T.muted),
                      ...artifactBody(widget.projectId, widget.stage, rev),
                    ],
                  ], sp(5)),
                ),
              ),
            ),
            if (reviewable) ApprovalBar(projectId: widget.projectId, kind: widget.stage, revision: rev['revision'] as int),
          ]);
        },
      ),
    );
  }
}

/// Sticky footer for a draft awaiting review: approve, or request changes with a comment.
class ApprovalBar extends StatefulWidget {
  const ApprovalBar({super.key, required this.projectId, required this.kind, required this.revision});
  final String projectId;
  final String kind;
  final int revision;
  @override
  State<ApprovalBar> createState() => _ApprovalBarState();
}

class _ApprovalBarState extends State<ApprovalBar> {
  bool _busy = false;

  Future<bool> _decide(String decision, [String? comment]) async {
    setState(() => _busy = true);
    try {
      await api('/projects/${widget.projectId}/artifacts/${widget.kind}/revisions/${widget.revision}/$decision',
          method: 'POST', json: {'comment': (comment?.isEmpty ?? true) ? null : comment});
      refreshAll();
      return true;
    } catch (e) {
      if (mounted) await alert(context, "Couldn't save your decision", errorMessage(e));
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve() async {
    if (await _decide('approve')) HapticFeedback.mediumImpact();
  }

  Future<void> _requestChanges() async {
    final comment = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: C.bg,
      builder: (_) => const _ChangesSheet(),
    );
    if (comment != null && comment.trim().isNotEmpty) await _decide('request-changes', comment.trim());
  }

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(color: C.surface, border: Border(top: BorderSide(color: C.borderStrong, width: 0.5))),
        padding: EdgeInsets.fromLTRB(sp(4), sp(3), sp(4), sp(3)),
        child: SafeArea(
          top: false,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('${stageLabel[widget.kind]} revision ${widget.revision} is ready for your review',
                style: T.caption, textAlign: TextAlign.center),
            SizedBox(height: sp(2)),
            Row(children: [
              Expanded(
                child: Btn('Request changes', variant: BtnVariant.secondary, block: true, onPressed: _busy ? null : _requestChanges),
              ),
              SizedBox(width: sp(3)),
              Expanded(child: Btn('Approve', block: true, loading: _busy, onPressed: _approve)),
            ]),
          ]),
        ),
      );
}

class _ChangesSheet extends StatefulWidget {
  const _ChangesSheet();
  @override
  State<_ChangesSheet> createState() => _ChangesSheetState();
}

class _ChangesSheetState extends State<_ChangesSheet> {
  final _c = TextEditingController();
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          padding: EdgeInsets.all(sp(6)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: gap([
            Text('What should change?', style: T.title),
            Text("The agent revises the draft using your comment. Be specific about what's missing or wrong.", style: T.muted),
            TextField(
              controller: _c,
              autofocus: true,
              minLines: 5,
              maxLines: 10,
              maxLength: 2000,
              style: T.body,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'e.g. Add offline support for field staff', counterText: ''),
            ),
            Row(children: [
              Expanded(child: Btn('Cancel', variant: BtnVariant.secondary, block: true, onPressed: () => Navigator.pop(context))),
              SizedBox(width: sp(3)),
              Expanded(
                child: Btn('Send request',
                    block: true, onPressed: _c.text.trim().isEmpty ? null : () => Navigator.pop(context, _c.text)),
              ),
            ]),
          ], sp(4))),
        ),
      );
}
