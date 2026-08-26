import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'conversation_picker_screen.dart';
import 'product_form_screen.dart';

class ProductDetailScreen extends StatelessWidget {
  final CatalogProduct product;
  final Catalog catalog;

  const ProductDetailScreen({super.key, required this.product, required this.catalog});


  Future<void> _shareOnWhatsApp(BuildContext context) async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const ConversationPickerScreen()),
    );
    if (result == null || result['conversationId'] == null) return;
    final shareRes = await ApiService().sendWhatsAppCatalog(
      conversationId: result['conversationId'].toString(),
      type: 'product',
      productId: product.id,
    );
    if (context.mounted) {
      if (shareRes['error'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('WhatsApp शेयर विफल: ' + shareRes['error'].toString())));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('प्रोडक्ट WhatsApp पर भेजा गया')));
      }
    }
  }
  Future<void> _deleteProduct(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('प्रोडक्ट हटाएं?'),
        content: Text(product.name + ' हमेशा के लिए हटा दिया जाएगा।'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('हटाएं')),
        ],
      ),
    );
    if (confirmed != true) return;
    final res = await ApiService().deleteProduct(product.id);
    if (context.mounted) {
      if (res['error'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('त्रुटि: ' + res['error'].toString())));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('प्रोडक्ट हटाया गया')));
        Navigator.of(context).pop();
      }
    }
  }

  Future<void> _share(BuildContext context) async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const ConversationPickerScreen()),
    );
    if (result == null || result['conversationId'] == null) return;
    final shareRes = await ApiService().shareCatalog(
      conversationId: result['conversationId'].toString(),
      type: 'product',
      productId: product.id,
      note: result['note']?.toString(),
    );
    if (context.mounted) {
      if (shareRes['error'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('शेयर विफल: ' + shareRes['error'].toString())));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('प्रोडक्ट चैट में भेजा गया')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('प्रोडक्ट विवरण')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: product.imageUrl != null && product.imageUrl!.isNotEmpty
                ? Image.network(product.imageUrl!, height: 240, width: double.infinity, fit: BoxFit.cover)
                : Container(height: 240, color: AppColors.surface, child: const Icon(Icons.image_outlined, size: 64, color: AppColors.textMuted)),
          ),
          const SizedBox(height: 20),
          Text(product.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          Text(product.currency + ' ' + product.price.toStringAsFixed(0), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.accent)),
          if (product.description != null && product.description!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(product.description!, style: const TextStyle(color: AppColors.textMuted)),
          ],
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: () => _share(context),
            icon: const Icon(Icons.share),
            label: const Text('चैट में शेयर करें'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _shareOnWhatsApp(context),
            icon: const Icon(Icons.chat_bubble_outline),
            label: const Text('WhatsApp पर शेयर करें'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final result = await Navigator.of(context).push<Map<String, dynamic>>(
                MaterialPageRoute(builder: (_) => ProductFormScreen(catalogId: catalog.id, product: product)),
              );
              if (result != null && result['success'] == true && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('प्रोडक्ट अपडेट किया गया')));
              }
            },
            icon: const Icon(Icons.edit_outlined),
            label: const Text('संपादित करें'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _deleteProduct(context),
            icon: const Icon(Icons.delete_outline, color: AppColors.danger),
            label: const Text('हटाएं', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
  }
}
