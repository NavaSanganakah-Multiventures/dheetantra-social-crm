class UserModel {
  final String id;
  final String name;
  final String email;
  final DateTime createdAt;
  final bool isRegistered;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isRegistered,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown',
      email: json['email'] ?? '',
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
      isRegistered: json['is_registered'] == 1 || json['is_registered'] == true,
    );
  }
}

class WorkspaceModel {
  final String id;
  final String name;
  final String planId;
  final DateTime createdAt;

  WorkspaceModel({
    required this.id,
    required this.name,
    required this.planId,
    required this.createdAt,
  });

  factory WorkspaceModel.fromJson(Map<String, dynamic> json) {
    return WorkspaceModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unnamed Workspace',
      planId: json['plan_id'] ?? 'free',
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
    );
  }
}

class PlanModel {
  final String id;
  final String name;
  final double price;
  final String billingPeriod;
  final bool isActive;

  PlanModel({
    required this.id,
    required this.name,
    required this.price,
    required this.billingPeriod,
    required this.isActive,
  });

  factory PlanModel.fromJson(Map<String, dynamic> json) {
    return PlanModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown Plan',
      price: (json['upfront_price'] ?? 0).toDouble(),
      billingPeriod: json['billing_period'] ?? 'monthly',
      isActive: json['is_active'] == 1 || json['is_active'] == true,
    );
  }
}
