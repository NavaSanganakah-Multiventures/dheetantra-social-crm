import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'catalog_form_screen.dart';
import 'conversation_picker_screen.dart';
import 'product_detail_screen.dart';
import 'product_form_screen.dart';

class CatalogDetailScreen extends StatefulWidget {
  final Catalog catalog;

  const CatalogDetailScreen({super.key, required this.catalog});

  @override
  State<CatalogDetailScreen> createState() => _CatalogDetailScreenState();
}

class _CatalogDetailScreenState extends State<CatalogDetailScreen> {
  late Catalog _catalog;
  bool _loading = true;
  List<CatalogProduct> _products = [];

  @override
  void initState() {
    super.initState();
    _catalog = widget.catalog;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final result = await ApiService().getCatalog(_catalog.id);
    if (!mounted) return;
    if (result['error'] != null) {
      setState(() => _loading = false);
      return;
    }
    final cat = result['catalog'];
    final prods = (result['products'] as List?) ?? [];
    setState(() {
      _catalog = Catalog.fromJson(cat);
      _products = prods.map((j) => CatalogProduct.fromJson(j)).toList();
      _loading = false;
    });
  }

  Future<void> _addProduct() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => ProductFormScreen(catalogId: _catalog.id)),
    );
    if (result != null && result['success'] == true) await _load();
  }


  Future<void> _shareOnWhatsApp(BuildContext context) async {
    final bodyController = TextEditingController(text: 'Check out: ${_catalog.name}!');
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('WhatsApp message'),
        content: TextField(
          controller: bodyController,
          maxLines: 2,
          decoration: const InputDecoration(labelText: 'Optional message'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Next')),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const ConversationPickerScreen()),
    );
    if (result == null || result['conversationId'] == null) return;
    final shareRes = await ApiService().sendWhatsAppCatalog(
      conversationId: result['conversationId'].toString(),
      type: 'catalog',
      catalogId: _catalog.id,
      body: bodyController.text.trim(),
      sectionTitle: '${_catalog.name} products',
    );
    if (context.mounted) {
      if (shareRes['error'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('WhatsApp share failed: ' + shareRes['error'].toString())));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Catalog shared on WhatsApp')));
      }
    }
  }
  Future<void> _editCatalog() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => CatalogFormScreen(catalog: _catalog)),
    );
    if (result != null && result['success'] == true) await _load();
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: const BoxDecoration(color: AppColors.surface, border: Border(bottom: BorderSide(color: AppColors.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_catalog.coverImageUrl != null && _catalog.coverImageUrl!.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(_catalog.coverImageUrl!, height: 160, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: Text(_catalog.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textPrimary))),
              IconButton(onPressed: _editCatalog, icon: const Icon(Icons.edit_outlined, color: AppColors.accent)),
              IconButton(onPressed: () => _shareOnWhatsApp(context), icon: const Icon(Icons.share, color: AppColors.whatsapp)),
            ],
          ),
          const SizedBox(height: 6),
          Text(_products.length.toString() + ' products', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          if (_catalog.description != null && _catalog.description!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_catalog.description!, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_catalog.name)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(child: _buildHeader()),
                  if (_products.isEmpty)
                    const SliverFillRemaining(
                      child: Center(child: EmptyState(icon: Icons.shopping_bag_outlined, title: 'No products', subtitle: 'Add the first product.')),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.all(16),
                      sliver: SliverGrid(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.75),
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => _ProductCard(
                            product: _products[i],
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => ProductDetailScreen(product: _products[i], catalog: _catalog)),
                            ),
                          ),
                          childCount: _products.length,
                        ),
                      ),
                    ),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addProduct,
        icon: const Icon(Icons.add),
        label: const Text('Product'),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  final CatalogProduct product;
  final VoidCallback onTap;

  const _ProductCard({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                width: double.infinity,
                color: AppColors.surface,
                child: product.imageUrl != null && product.imageUrl!.isNotEmpty
                    ? Image.network(product.imageUrl!, fit: BoxFit.cover)
                    : const Center(child: Icon(Icons.image_outlined, color: AppColors.textMuted, size: 40)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  const SizedBox(height: 4),
                  Text(product.currency + ' ' + product.price.toStringAsFixed(0), style: const TextStyle(color: AppColors.accent, fontSize: 12, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
