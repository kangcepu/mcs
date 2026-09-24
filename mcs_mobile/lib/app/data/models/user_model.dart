class User {
  final String idUser;
  final String username;
  final String fullname;
  final String email;
  final String avatar;
  final String phone;
  final Division? division;
  final Company? company;
  final Permissions? permissions;

  User({
    required this.idUser,
    required this.username,
    required this.fullname,
    required this.email,
    required this.avatar,
    this.phone = '',
    this.division,
    this.company,
    this.permissions,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      idUser: json['id_user']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      fullname: json['fullname']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      avatar: json['avatar']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      division:
          json['division'] != null ? Division.fromJson(json['division']) : null,
      company:
          json['company'] != null ? Company.fromJson(json['company']) : null,
      permissions: json['permissions'] != null
          ? Permissions.fromJson(json['permissions'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_user': idUser,
      'username': username,
      'fullname': fullname,
      'email': email,
      'avatar': avatar,
      'phone': phone,
      'division': division?.toJson(),
      'company': company?.toJson(),
      'permissions': permissions?.toJson(),
    };
  }
}

class Division {
  final String idDivision;
  final String divisionName;
  final String divisionCode;

  Division({
    required this.idDivision,
    required this.divisionName,
    required this.divisionCode,
  });

  factory Division.fromJson(Map<String, dynamic> json) {
    return Division(
      idDivision: json['id_division']?.toString() ?? '',
      divisionName: json['division_name']?.toString() ?? '',
      divisionCode: json['division_code']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_division': idDivision,
      'division_name': divisionName,
      'division_code': divisionCode,
    };
  }
}

class Company {
  final String idCompany;
  final String companyName;

  Company({
    required this.idCompany,
    required this.companyName,
  });

  factory Company.fromJson(Map<String, dynamic> json) {
    return Company(
      idCompany: json['id_company']?.toString() ?? '',
      companyName: json['company_name']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_company': idCompany,
      'company_name': companyName,
    };
  }
}

class Permissions {
  final int woIt;
  final int woMtc;
  final int woMtcAll;
  final int woCrossAccess;
  final int woGa;
  final int woOperational;
  final int woPreventive;
  final int woExecutor;
  final int woVoid;
  final int scanningCreateWo;
  final int scanningEdit;
  final int dailyControl;
  final int dailyControlAll;
  final int privilageAsset;
  final int assetMutation;
  final int reportAssetMutation;
  final int approvalAssetMutation;
  final int approvalAll;
  final int reportAsset;
  final int reportAssetHistory;
  final int listOfAsset;
  final int recapWo;
  final int reportCr;
  final int reportSo;

  Permissions({
    required this.woIt,
    required this.woMtc,
    required this.woMtcAll,
    required this.woCrossAccess,
    required this.woGa,
    required this.woOperational,
    required this.woPreventive,
    required this.woExecutor,
    required this.woVoid,
    required this.scanningCreateWo,
    required this.scanningEdit,
    required this.dailyControl,
    required this.dailyControlAll,
    required this.privilageAsset,
    required this.assetMutation,
    required this.reportAssetMutation,
    required this.approvalAssetMutation,
    required this.approvalAll,
    required this.reportAsset,
    required this.reportAssetHistory,
    required this.listOfAsset,
    required this.recapWo,
    required this.reportCr,
    required this.reportSo,
  });

  factory Permissions.fromJson(Map<String, dynamic> json) {
    return Permissions(
      woIt: _parsePermission(json['wo_it']),
      woMtc: _parsePermission(json['wo_mtc']),
      woMtcAll: _parsePermission(json['wo_mtc_all']),
      woCrossAccess: _parsePermission(json['wo_cross_access']),
      woGa: _parsePermission(json['wo_ga']),
      woOperational: _parsePermission(json['wo_operational']),
      woPreventive: _parsePermission(json['wo_preventive']),
      woExecutor: _parsePermission(json['wo_executor']),
      woVoid: _parsePermission(json['wo_void']),
      scanningCreateWo: _parsePermission(json['scanning_create_wo']),
      scanningEdit: _parsePermission(json['scanning_edit']),
      dailyControl: _parsePermission(json['daily_control']),
      dailyControlAll: _parsePermission(json['daily_control_all']),
      privilageAsset: _parsePermission(json['privilage_asset']),
      assetMutation: _parsePermission(json['asset_mutation']),
      reportAssetMutation: _parsePermission(json['report_asset_mutation']),
      approvalAssetMutation: _parsePermission(json['approval_asset_mutation']),
      approvalAll: _parsePermission(json['approval_all']),
      reportAsset: _parsePermission(json['report_asset']),
      reportAssetHistory: _parsePermission(json['report_asset_history']),
      listOfAsset: _parsePermission(json['list_of_asset']),
      recapWo: _parsePermission(json['recap_wo']),
      reportCr: _parsePermission(json['report_cr']),
      reportSo: _parsePermission(json['report_so'] ?? 1),
    );
  }

  static int _parsePermission(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  Map<String, dynamic> toJson() {
    return {
      'wo_it': woIt,
      'wo_mtc': woMtc,
      'wo_mtc_all': woMtcAll,
      'wo_cross_access': woCrossAccess,
      'wo_ga': woGa,
      'wo_operational': woOperational,
      'wo_preventive': woPreventive,
      'wo_executor': woExecutor,
      'wo_void': woVoid,
      'scanning_create_wo': scanningCreateWo,
      'scanning_edit': scanningEdit,
      'daily_control': dailyControl,
      'daily_control_all': dailyControlAll,
      'privilage_asset': privilageAsset,
      'asset_mutation': assetMutation,
      'report_asset_mutation': reportAssetMutation,
      'approval_asset_mutation': approvalAssetMutation,
      'approval_all': approvalAll,
      'report_asset': reportAsset,
      'report_asset_history': reportAssetHistory,
      'list_of_asset': listOfAsset,
      'recap_wo': recapWo,
      'report_cr': reportCr,
      'report_so': reportSo,
    };
  }
}
