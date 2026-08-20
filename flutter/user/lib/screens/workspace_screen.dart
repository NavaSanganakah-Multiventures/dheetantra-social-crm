import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class WorkspaceScreen extends StatefulWidget {
  const WorkspaceScreen({super.key});

  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  bool _loading = true;
  bool _saving = false;
  List<WorkspaceMember> _members = [];
  String _workspaceName = '';
  String _planName = '';
  String _userRole = 'member';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final user = await ApiService().getMe();
    final workspace = await ApiService().getWorkspace();
    final membersData = await ApiService().getWorkspaceMembers();
    if (!mounted) return;
    setState(() {
      _userRole = user?['role'] ?? 'member';
      _workspaceName = workspace?['name'] ?? workspace?['workspace']?['name'] ?? 'Workspace';
      _planName = workspace?['plan']?['name'] ?? workspace?['plan_name'] ?? 'Free';
      _members = membersData is List
          ? membersData.map((j) => WorkspaceMember.fromJson(j as Map<String, dynamic>)).toList()
          : [];
      _loading = false;
    });
  }

  bool get _canManage {
    return _userRole == 'owner' || _userRole == 'admin';
  }

  Future<void> _showAddMemberDialog() async {
    final emailController = TextEditingController();
    String selectedRole = 'member';

    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('मेम्बर जोड़ें'),
        content: StatefulBuilder(
          builder: (context, setLocalState) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'ईमेल',
                    hintText: 'user@example.com',
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'member', label: Text('Member')),
                    ButtonSegment(value: 'admin', label: Text('Admin')),
                  ],
                  selected: {selectedRole},
                  onSelectionChanged: (set) {
                    setLocalState(() => selectedRole = set.first);
                  },
                ),
              ],
            );
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop({
                'email': emailController.text.trim(),
                'role': selectedRole,
              });
            },
            child: const Text('जोड़ें'),
          ),
        ],
      ),
    );

    if (result == null || result['email']!.isEmpty) return;
    setState(() => _saving = true);
    final res = await ApiService().addWorkspaceMember(result['email']!, role: result['role']!);
    setState(() => _saving = false);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('त्रुटि: ${res['error']}')));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('मेम्बर जोड़ा गया')));
      _loadData();
    }
  }

  Future<void> _changeRole(WorkspaceMember member) async {
    if (!_canManage) return;
    String selectedRole = member.role;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${member.email} की भूमिका बदलें'),
        content: StatefulBuilder(
          builder: (context, setLocalState) {
            return SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'owner', label: Text('Owner')),
                ButtonSegment(value: 'admin', label: Text('Admin')),
                ButtonSegment(value: 'member', label: Text('Member')),
              ],
              selected: {selectedRole},
              onSelectionChanged: (set) {
                setLocalState(() => selectedRole = set.first);
              },
            );
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('सेव करें'),
          ),
        ],
      ),
    );

    if (confirmed != true || selectedRole == member.role) return;
    setState(() => _saving = true);
    final res = await ApiService().updateWorkspaceMember(member.id, selectedRole);
    setState(() => _saving = false);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('त्रुटि: ${res['error']}')));
    } else {
      _loadData();
    }
  }

  Future<void> _removeMember(WorkspaceMember member) async {
    if (!_canManage) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('मेम्बर हटाएं'),
        content: Text('क्या आप ${member.email} को हटाना चाहते हैं?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _saving = true);
    final res = await ApiService().removeWorkspaceMember(member.id);
    setState(() => _saving = false);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('त्रुटि: ${res['error']}')));
    } else {
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('वर्कस्पेस प्रबंधन'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  _buildHeaderCard(),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'मेम्बर्स',
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (_canManage)
                        TextButton.icon(
                          onPressed: _showAddMemberDialog,
                          icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                          label: const Text('जोड़ें'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _buildMembersList(),
                ],
              ),
            ),
      floatingActionButton: _saving
          ? const FloatingActionButton(
              onPressed: null,
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : null,
    );
  }

  Widget _buildHeaderCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.business_center_outlined, color: AppColors.accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _workspaceName,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Plan: $_planName',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'Workspace ID: ${ApiService().workspaceId ?? ''}',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildMembersList() {
    if (_members.isEmpty) {
      return const EmptyState(
        icon: Icons.people_outline_rounded,
        title: 'कोई मेम्बर नहीं',
        subtitle: 'इस workspace में अभी कोई सदस्य नहीं है।',
      );
    }
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < _members.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 56),
            _MemberTile(
              member: _members[i],
              canManage: _canManage,
              isMe: _members[i].email == ApiService().currentUser?['email'],
              onChangeRole: _changeRole,
              onRemove: _removeMember,
            ),
          ],
        ],
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  final WorkspaceMember member;
  final bool canManage;
  final bool isMe;
  final ValueChanged<WorkspaceMember> onChangeRole;
  final ValueChanged<WorkspaceMember> onRemove;

  const _MemberTile({
    required this.member,
    required this.canManage,
    required this.isMe,
    required this.onChangeRole,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Avatar(name: member.name ?? member.email, size: 40),
      title: Text(
        member.name ?? member.email,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        '${member.email} • ${member.role.toUpperCase()}${isMe ? ' (You)' : ''}',
        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      ),
      trailing: canManage && !isMe
          ? PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert_rounded, color: AppColors.textMuted),
              color: AppColors.surfaceAlt,
              onSelected: (value) {
                if (value == 'role') onChangeRole(member);
                if (value == 'remove') onRemove(member);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'role', child: Text('भूमिका बदलें')),
                const PopupMenuItem(value: 'remove', child: Text('हटाएं')),
              ],
            )
          : null,
    );
  }
}
