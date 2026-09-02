import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class WhatsAppAccountsScreen extends StatefulWidget {
  const WhatsAppAccountsScreen({super.key});

  @override
  State<WhatsAppAccountsScreen> createState() => _WhatsAppAccountsScreenState();
}

class _WhatsAppAccountsScreenState extends State<WhatsAppAccountsScreen> {
  bool _loading = true;
  bool _saving = false;
  List<WhatsAppConfig> _configs = [];
  String _userRole = 'member';

  static const _replyModes = [
    ('manual', 'Manual'),
    ('ai', 'AI Bot'),
    ('rule_based', 'Rule based'),
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final user = await ApiService().getMe();
    final data = await ApiService().getWhatsAppConfigs();
    if (!mounted) return;
    setState(() {
      _userRole = user?['role'] ?? 'member';
      final configsList = data?['configs'] as List? ?? data?['config'] as List? ?? [];
      _configs = configsList
          .map((j) => WhatsAppConfig.fromJson(j as Map<String, dynamic>))
          .toList();
      _loading = false;
    });
  }

  bool get _canManage {
    return _userRole == 'owner' || _userRole == 'admin';
  }

  Future<void> _saveConfig(WhatsAppConfig config, {String? accessTokenOverride}) async {
    final map = config.toJson(
      accessTokenOverride: accessTokenOverride,
      includeToken: accessTokenOverride != null ? accessTokenOverride.isNotEmpty : true,
    );
    final res = await ApiService().saveWhatsAppConfig(map);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${res['error']}')));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
      _loadData();
    }
  }

  Future<void> _deleteConfig(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete WhatsApp account'),
        content: const Text('Are you sure you want to delete this account?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _saving = true);
    final res = await ApiService().deleteWhatsAppConfig(id);
    setState(() => _saving = false);
    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${res['error']}')));
    } else {
      _loadData();
    }
  }

  void _showForm({WhatsAppConfig? config}) {
    if (!_canManage) return;
    final isEdit = config != null;
    final phoneController = TextEditingController(text: config?.phoneNumberId ?? '');
    final wabaController = TextEditingController(text: config?.wabaId ?? '');
    final tokenController = TextEditingController();
    final verifyController = TextEditingController(text: config?.verifyToken ?? '');
    final aboutController = TextEditingController(text: config?.about ?? '');
    final descController = TextEditingController(text: config?.description ?? '');
    final websiteController = TextEditingController(text: config?.website ?? '');
    final emailController = TextEditingController(text: config?.email ?? '');
    String replyMode = config?.replyMode ?? 'manual';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isEdit ? 'Edit WhatsApp account' : 'New WhatsApp account',
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: phoneController,
                  decoration: const InputDecoration(labelText: 'Phone Number ID'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: wabaController,
                  decoration: const InputDecoration(labelText: 'WABA ID (optional)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: tokenController,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'Permanent Access Token${isEdit ? ' (leave blank to keep the current one)' : ''}',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: verifyController,
                  decoration: const InputDecoration(labelText: 'Webhook Verify Token'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: replyMode,
                  dropdownColor: AppColors.surfaceAlt,
                  decoration: const InputDecoration(labelText: 'Auto-reply mode'),
                  items: _replyModes
                      .map((m) => DropdownMenuItem(value: m.$1, child: Text(m.$2)))
                      .toList(),
                  onChanged: (v) => replyMode = v ?? 'manual',
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: aboutController,
                  decoration: const InputDecoration(labelText: 'About (business)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descController,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: websiteController,
                  decoration: const InputDecoration(labelText: 'Website'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  decoration: const InputDecoration(labelText: 'Business Email'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _saving
                      ? null
                      : () async {
                          final newConfig = WhatsAppConfig(
                            id: config?.id ?? '',
                            phoneNumberId: phoneController.text.trim(),
                            wabaId: wabaController.text.trim(),
                            verifyToken: verifyController.text.trim(),
                            replyMode: replyMode,
                            about: aboutController.text.trim(),
                            description: descController.text.trim(),
                            website: websiteController.text.trim(),
                            email: emailController.text.trim(),
                          );
                          Navigator.of(ctx).pop();
                          setState(() => _saving = true);
                          await _saveConfig(
                            newConfig,
                            accessTokenOverride: tokenController.text.trim(),
                          );
                          setState(() => _saving = false);
                        },
                  child: Text(isEdit ? 'Update' : 'Add'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('WhatsApp Accounts'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  if (_configs.isEmpty)
                    const EmptyState(
                      icon: Icons.phone_android_outlined,
                      title: 'No WhatsApp accounts',
                      subtitle: 'Please add your Meta WhatsApp Business account.',
                    )
                  else
                    Column(
                      children: [
                        for (var i = 0; i < _configs.length; i++) ...[
                          if (i > 0) const SizedBox(height: 12),
                          _ConfigCard(
                            config: _configs[i],
                            canManage: _canManage,
                            onEdit: () => _showForm(config: _configs[i]),
                            onDelete: () => _deleteConfig(_configs[i].id),
                          ),
                        ],
                      ],
                    ),
                ],
              ),
            ),
      floatingActionButton: _canManage
          ? FloatingActionButton.extended(
              onPressed: _saving ? null : () => _showForm(),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add account'),
            )
          : null,
    );
  }
}

class _ConfigCard extends StatelessWidget {
  final WhatsAppConfig config;
  final bool canManage;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _ConfigCard({
    required this.config,
    required this.canManage,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
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
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.whatsapp.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.chat_bubble, color: AppColors.whatsapp),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      config.phoneNumberId,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Mode: ${config.replyMode}',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (canManage)
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert_rounded, color: AppColors.textMuted),
                  color: AppColors.surfaceAlt,
                  onSelected: (value) {
                    if (value == 'edit') onEdit();
                    if (value == 'delete') onDelete();
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    const PopupMenuItem(value: 'delete', child: Text('Delete')),
                  ],
                ),
            ],
          ),
          if (config.about.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              config.about,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              _Badge(
                label: config.callingEnabled ? 'Calling on' : 'Calling off',
                color: config.callingEnabled ? AppColors.success : AppColors.danger,
              ),
              const SizedBox(width: 8),
              if (config.wabaId != null && config.wabaId!.isNotEmpty)
                const _Badge(
                  label: 'WABA connected',
                  color: AppColors.accent,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;

  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}
