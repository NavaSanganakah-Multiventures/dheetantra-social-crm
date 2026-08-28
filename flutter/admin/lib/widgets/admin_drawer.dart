import 'package:flutter/material.dart';
import '../core/constants.dart';
import '../services/api_service.dart';

class AdminDrawer extends StatelessWidget {
  final String currentRoute;

  const AdminDrawer({Key? key, required this.currentRoute}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.drawerBackground,
      child: Column(
        children: [
          const DrawerHeader(
            decoration: BoxDecoration(
              color: AppColors.primary,
            ),
            child: SizedBox(
              width: double.infinity,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.admin_panel_settings, color: Colors.white, size: 48),
                  SizedBox(height: 12),
                  Text(
                    'Dhitantra Admin',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          _buildDrawerItem(
            context,
            icon: Icons.dashboard,
            title: 'Dashboard',
            route: '/dashboard',
          ),
          _buildDrawerItem(
            context,
            icon: Icons.people,
            title: 'Users',
            route: '/users',
          ),
          _buildDrawerItem(
            context,
            icon: Icons.business,
            title: 'Workspaces',
            route: '/workspaces',
          ),
          _buildDrawerItem(
            context,
            icon: Icons.receipt_long,
            title: 'School Charges',
            route: '/school-charges',
          ),
          _buildDrawerItem(
            context,
            icon: Icons.monetization_on,
            title: 'Plans',
            route: '/plans',
          ),
          _buildDrawerItem(
            context,
            icon: Icons.content_copy,
            title: 'KV Copy',
            route: '/kv-copy',
          ),
          const Spacer(),
          const Divider(color: Colors.white24),
          _buildDrawerItem(
            context,
            icon: Icons.settings,
            title: 'Settings',
            route: '/settings',
          ),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.redAccent),
            title: const Text('Logout', style: TextStyle(color: Colors.redAccent)),
            onTap: () async {
              await ApiService.logout();
              if (context.mounted) {
                Navigator.pushReplacementNamed(context, '/login');
              }
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildDrawerItem(BuildContext context, {required IconData icon, required String title, required String route}) {
    final isSelected = currentRoute == route;
    return ListTile(
      leading: Icon(
        icon,
        color: isSelected ? AppColors.drawerTextSelected : AppColors.drawerText,
      ),
      title: Text(
        title,
        style: TextStyle(
          color: isSelected ? AppColors.drawerTextSelected : AppColors.drawerText,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        ),
      ),
      tileColor: isSelected ? Colors.white.withOpacity(0.1) : null,
      onTap: () {
        if (!isSelected) {
          Navigator.pushReplacementNamed(context, route);
        } else {
          Navigator.pop(context);
        }
      },
    );
  }
}
