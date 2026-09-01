import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class EmailComposeScreen extends StatefulWidget {
  const EmailComposeScreen({super.key});

  @override
  State<EmailComposeScreen> createState() => _EmailComposeScreenState();
}

class _EmailComposeScreenState extends State<EmailComposeScreen> {
  bool _loading = true;
  bool _sending = false;
  List<EmailMailbox> _mailboxes = [];
  EmailMailbox? _selectedMailbox;
  final _toController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadMailboxes();
  }

  Future<void> _loadMailboxes() async {
    setState(() => _loading = true);
    final data = await ApiService().getEmailMailboxes();
    if (!mounted) return;
    setState(() {
      _mailboxes = data
          .map((j) => EmailMailbox.fromJson(j as Map<String, dynamic>))
          .toList();
      final active = _mailboxes.where((m) => m.domainStatus == 'active').toList();
      _selectedMailbox = active.isNotEmpty ? active.first : (_mailboxes.isNotEmpty ? _mailboxes.first : null);
      _loading = false;
    });
  }

  Future<void> _send() async {
    final to = _toController.text.trim();
    final subject = _subjectController.text.trim();
    final body = _bodyController.text.trim();

    if (to.isEmpty || subject.isEmpty || body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in recipient, subject and message')),
      );
      return;
    }

    setState(() => _sending = true);
    final res = await ApiService().sendEmail(
      to: to,
      subject: subject,
      body: body,
      fromAddress: _selectedMailbox?.emailAddress,
    );
    setState(() => _sending = false);

    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email sent')),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Send Email'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_mailboxes.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Text(
                      'No mailbox configured. Please add and verify a domain from the Dashboard.',
                      style: TextStyle(color: AppColors.warning),
                    ),
                  )
                else
                  DropdownButtonFormField<EmailMailbox>(
                    initialValue: _selectedMailbox,
                    dropdownColor: AppColors.surfaceAlt,
                    decoration: const InputDecoration(labelText: 'From (sender address)'),
                    items: _mailboxes
                        .map((m) => DropdownMenuItem(
                              value: m,
                              child: Text(
                                m.emailAddress,
                                style: const TextStyle(color: AppColors.textPrimary),
                              ),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _selectedMailbox = v),
                  ),
                const SizedBox(height: 16),
                TextField(
                  controller: _toController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'To',
                    hintText: 'recipient@example.com',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _subjectController,
                  decoration: const InputDecoration(
                    labelText: 'Subject',
                    hintText: 'Email subject',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _bodyController,
                  maxLines: 8,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Message',
                    hintText: 'Write here...',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _sending || _mailboxes.isEmpty ? null : _send,
                  child: _sending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Send'),
                ),
              ],
            ),
    );
  }
}
