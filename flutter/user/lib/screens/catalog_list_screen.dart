import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'catalog_detail_screen.dart';
import 'catalog_form_screen.dart';

class CatalogListScreen extends StatefulWidget {
  const CatalogListScreen({super.key});

  @override
  State<CatalogListScreen> createState() => _CatalogListScreenState();
}

class _CatalogListScreenState extends State<CatalogListScreen> {
  bool _loading = true;
  List<Catalog> _catalogs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await ApiService().getCatalogs(status: 'active');
    if (!mounted) return;
    setState(() {
      _catalogs = list.map((j) => Catalog.fromJson(j)).toList();
      _loading = false;
    });
  }

  Future<void> _createCatalog() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const CatalogFormScreen()),
    );
    if (result != null && result['success'] == true) await _load();
  }

  Future<void> _deleteCatalog(Catalog catalog) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Catalog delete karein?'),
        content: Text('${catalog.name} permanently delete ho jayega.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    final res = await ApiService().deleteCatalog(catalog.id);
    if (mounted) {
      if (res['error'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${res['error']}')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Catalog deleted')));
        await _load();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Catalogs')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _catalogs.isEmpty
              ? const Center(child: EmptyState(icon: Icons.folder_outlined, title: 'Koi catalog nahi', subtitle: 'Naya catalog banane ke liye + dabayein.'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _catalogs.length,
                    itemBuilder: (context, i) => _CatalogCard(
                      catalog: _catalogs[i],
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => CatalogDetailScreen(catalog: _catalogs[i])),
                      ),
                      onDelete: () => _deleteCatalog(_catalogs[i]),
                    ),
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createCatalog,
        icon: const Icon(Icons.add),
        label: const Text('Catalog'),
      ),
    );
  }
}

class _CatalogCard extends StatelessWidget {
  final Catalog catalog;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _CatalogCard({required this.catalog, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: catalog.coverImageUrl != null && catalog.coverImageUrl!.isNotEmpty
                    ? Image.network(catalog.coverImageUrl!, width: 64, height: 64, fit: BoxFit.cover)
                    : Container(width: 64, height: 64, color: AppColors.surface, child: const Icon(Icons.folder_outlined, color: AppColors.textMuted)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(catalog.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 4),
                    Text('${catalog.productsCount} products', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    if (catalog.description != null && catalog.description!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(catalog.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                    ],
                  ],
                ),
              ),
              IconButton(onPressed: onDelete, icon: const Icon(Icons.delete_outline, color: AppColors.danger, size: 20)),
            ],
          ),
        ),
      ),
    );
  }
}
