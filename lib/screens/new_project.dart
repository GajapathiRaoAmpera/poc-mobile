import 'package:flutter/material.dart';

import '../core/api.dart';
import '../ui/kit.dart';
import 'project.dart';

const _agents = [
  ('Project Orchestrator', 'plans the work and asks what it needs'),
  ('Requirements Agent', 'drafts testable requirements and open questions'),
  ('Architecture Agent', 'designs the system'),
  ('Planning Agent', 'turns it into milestones, tasks and a schedule'),
  ('Budget Agent', 'prices the plan from your rates'),
  ('Development Agent', 'writes a checked scaffold script'),
];

/// Project creation is one question; preferences are optional.
class NewProjectScreen extends StatefulWidget {
  const NewProjectScreen({super.key});
  @override
  State<NewProjectScreen> createState() => _NewProjectScreenState();
}

class _NewProjectScreenState extends State<NewProjectScreen> {
  final _idea = TextEditingController();
  final _deploy = TextEditingController();
  final _tech = TextEditingController();
  bool _prefs = false;
  bool _busy = false;
  Object? _error;

  Future<void> _submit() async {
    final message = _idea.text.trim();
    if (message.isEmpty || _busy) return;
    final tech = _tech.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    final preferences = {
      if (_deploy.text.trim().isNotEmpty) 'deployment_preference': _deploy.text.trim(),
      if (tech.isNotEmpty) 'preferred_technologies': tech,
    };
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final out = (await api('/projects/intake',
          method: 'POST', json: {'message': message, if (preferences.isNotEmpty) 'preferences': preferences})) as Map;
      refreshAll();
      if (!mounted) return;
      final id = (out['project'] as Map)['id'] as String;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => ProjectScreen(id: id)));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('New project'),
          centerTitle: true,
          leadingWidth: 96,
          leading: Btn('Cancel', small: true, variant: BtnVariant.tertiary, onPressed: () => Navigator.pop(context)),
        ),
        body: FormBody(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('What do you want to build?', style: T.title),
            SizedBox(height: sp(2)),
            Text('Describe the idea in your own words. The agents take it from there and ask when they need something.',
                style: T.muted),
          ]),
          if (_error != null) Notice(errorMessage(_error)),
          LabeledField(
            label: 'Your idea',
            hint: 'Who is it for, what problem does it solve, and anything you know about scope or constraints.',
            controller: _idea,
            minLines: 6,
            maxLines: 12,
            maxLength: 4000,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
          ),
          Semantics(
            expanded: _prefs,
            child: InkWell(
              onTap: () => setState(() => _prefs = !_prefs),
              child: SizedBox(
                height: 44,
                child: Row(children: [
                  Icon(_prefs ? Icons.expand_more : Icons.chevron_right, size: 20, color: C.primary),
                  SizedBox(width: sp(2)),
                  Text('Add preferences (optional)', style: T.label.copyWith(fontSize: 16, color: C.primary)),
                ]),
              ),
            ),
          ),
          if (_prefs) ...[
            LabeledField(label: 'Deployment preference', hint: 'e.g. “Azure, EU region”.', controller: _deploy, maxLength: 300),
            LabeledField(label: 'Preferred technologies', hint: 'Separate with commas.', controller: _tech, maxLength: 300),
          ],
          Btn('Start project', block: true, loading: _busy, onPressed: _idea.text.trim().isEmpty ? null : _submit),
          Padding(
            padding: EdgeInsets.only(top: sp(4)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: gap([
              const Eyebrow('Who works on it'),
              for (final (i, (name, does)) in _agents.indexed)
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${i + 1}'.padLeft(2, '0'), style: T.mono.copyWith(color: C.primary)),
                  SizedBox(width: sp(3)),
                  Expanded(
                    child: Text.rich(TextSpan(children: [
                      TextSpan(text: name, style: T.label.copyWith(fontSize: 16)),
                      TextSpan(text: ' — $does', style: T.muted),
                    ])),
                  ),
                ]),
            ], sp(3))),
          ),
        ]),
      );
}
