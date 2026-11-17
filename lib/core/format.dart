/// Display helpers and status labels shared by every screen.
library;

import '../ui/kit.dart';

const _steps = [('y', 31536000), ('mo', 2592000), ('w', 604800), ('d', 86400), ('h', 3600), ('m', 60)];

/// "5m ago", "3d ago".
String relativeTime(String iso, [DateTime? now]) {
  final then = DateTime.tryParse(iso);
  if (then == null) return '';
  final seconds = (now ?? DateTime.now()).difference(then).inSeconds.clamp(0, 1 << 62);
  for (final (unit, size) in _steps) {
    if (seconds >= size) return '${seconds ~/ size}$unit ago';
  }
  return 'just now';
}

// Events stored before model names were removed server-side still carry "provider/model" text.
final _modelRef = RegExp(r',?\s*\(?\b(?:groq|gemini|openai|mock)/[^\s),]+\)?', caseSensitive: false);

/// Activity text as users should see it: no provider or model identifiers.
String cleanMessage(String msg) => msg
    .replaceFirst(RegExp(r'^Calling \S+'), 'Reasoning over the inputs')
    .replaceFirstMapped(RegExp(r'\(repair (\d+/\d+)\)'), (m) => '(self-correction ${m[1]})')
    .replaceFirstMapped(RegExp(r'requesting repair \((\d+/\d+)\)'), (m) => 'self-correcting (${m[1]})')
    .replaceAll('Model provider returned HTTP 429', 'The AI service is busy (rate limit reached)')
    .replaceAllMapped(RegExp(r'Model provider returned HTTP (\d+)'), (m) => 'The AI service returned an error (HTTP ${m[1]})')
    .replaceAll(_modelRef, '')
    .trim();

const _symbols = {'USD': r'$', 'EUR': '€', 'GBP': '£', 'INR': '₹', 'AUD': r'A$', 'CAD': r'CA$', 'JPY': '¥'};

/// Amounts are 2-decimal strings from the backend; display only (never sum on the client).
String formatMoney(Object? amount, String currency) {
  final n = num.tryParse('$amount')?.round() ?? 0;
  final digits = n.abs().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final sym = _symbols[currency];
  return '${n < 0 ? '-' : ''}${sym ?? '$currency '}$digits';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// ISO calendar date (YYYY-MM-DD) as "Nov 2"; parsed as UTC so the day never shifts.
String formatDay(String iso) {
  final d = DateTime.tryParse('${iso}T00:00:00Z');
  return d == null ? iso : '${_months[d.month - 1]} ${d.day}';
}

const _roleWords = {'qa': 'QA', 'ui': 'UI', 'ux': 'UX', 'devops': 'DevOps', 'ml': 'ML', 'ai': 'AI', 'sre': 'SRE', 'pm': 'PM'};

/// "frontend_engineer" -> "Frontend engineer".
String roleLabel(String role) {
  final label = role.split('_').where((w) => w.isNotEmpty).map((w) => _roleWords[w] ?? w).join(' ');
  return label.isEmpty ? label : label[0].toUpperCase() + label.substring(1);
}

const stageStatus = <String, (String, Tone)>{
  'UNAVAILABLE': ('Coming soon', Tone.neutral),
  'NOT_PLANNED': ('Not in plan', Tone.neutral),
  'BLOCKED': ('Blocked', Tone.neutral),
  'NOT_STARTED': ('Not started', Tone.neutral),
  'QUEUED': ('Queued', Tone.info),
  'RUNNING': ('Running', Tone.info),
  'FAILED': ('Failed', Tone.danger),
  'CANCELLED': ('Cancelled', Tone.neutral),
  'WAITING_FOR_INPUT': ('Needs your input', Tone.warning),
  'WAITING_FOR_APPROVAL': ('Ready for review', Tone.primary),
  'NEEDS_REVISION': ('Needs revision', Tone.warning),
  'APPROVED': ('Approved', Tone.success),
  'STALE': ('Stale', Tone.warning),
};

const projectStatus = <String, (String, Tone)>{
  'DRAFT': ('Draft', Tone.warning),
  'ACTIVE': ('Active', Tone.success),
  'ARCHIVED': ('Archived', Tone.neutral),
};

const stageLabel = {
  'requirements': 'Requirements',
  'architecture': 'Architecture',
  'plan': 'Project plan',
  'budget': 'Budget',
  'code': 'Scaffold',
};

const agentLabel = {
  'project_orchestrator': 'Project Orchestrator',
  'requirements_analyst': 'Requirements Agent',
  'solution_architect': 'Architecture Agent',
  'project_planner': 'Planning Agent',
  'budget_estimator': 'Budget Agent',
  'developer': 'Development Agent',
};

typedef AgentCopy = ({String name, String hint, String empty, List<String> suggestions});

/// Same copy as poc-frontend/src/components/agents/agent-chat-panel.tsx. Keys are conversation channels.
const agents = <String, AgentCopy>{
  'intake': (
    name: 'Project Orchestrator',
    hint: 'Answer its questions or add anything it should know. It re-plans when you reply.',
    empty: 'The Project Orchestrator will reply here.',
    suggestions: [],
  ),
  'requirements': (
    name: 'Requirements Agent',
    hint: 'Answer its questions, ask why, or request changes. Approval stays with you.',
    empty: 'Ask the Requirements Agent anything about these requirements.',
    suggestions: ['What is still unclear in these requirements?', 'Which requirements are riskiest to build?', 'Add a requirement for audit logging'],
  ),
  'architecture': (
    name: 'Architecture Agent',
    hint: 'Describe a change or ask about a decision. Proposed changes are reviewed in the web app.',
    empty: 'Describe the architecture you want, or a change to it.',
    suggestions: ['Why this design over microservices?', 'Add a cache in front of the API', 'What are the single points of failure?'],
  ),
  'plan': (
    name: 'Planning Agent',
    hint: 'Ask about the schedule or request changes to tasks and milestones. Approval stays with you.',
    empty: 'Ask the Planning Agent about the schedule, or describe a change.',
    suggestions: ['What is on the critical path?', 'Can we finish two weeks earlier?', 'Which tasks can run in parallel?'],
  ),
  'budget': (
    name: 'Budget Agent',
    hint: 'Ask how the cost was worked out or request changes. Approval stays with you.',
    empty: 'Ask the Budget Agent about the estimate, or describe a change.',
    suggestions: ['How was the total worked out?', 'What drives most of the cost?', 'What would a leaner version cost?'],
  ),
  'code': (
    name: 'Development Agent',
    hint: 'Ask for files to be added, changed or removed. Every change is re-checked with shellcheck.',
    empty: 'Describe a file or folder you want in the scaffold, or ask about one.',
    suggestions: ['Add a Dockerfile for the backend', 'Add a CI workflow that runs the tests', 'Explain the folder structure'],
  ),
};

/// Conversation channels in delivery order.
final channels = agents.keys.toList();

/// `pending.payload.stage ?? pending.stage` from a delivery's gate.
String? gateStage(Map<String, dynamic>? delivery) {
  final p = delivery?['pending'];
  if (p is! Map) return null;
  final payload = p['payload'];
  return (payload is Map ? payload['stage'] : null) as String? ?? p['stage'] as String?;
}

/// Shorthand for reading nested JSON lists of strings.
List<String> strings(Object? v) => v is List ? v.map((e) => '$e').toList() : const [];
List<Map<String, dynamic>> maps(Object? v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];
