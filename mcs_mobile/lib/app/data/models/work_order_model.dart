import '../../core/constants/api_constants.dart';

class WorkOrder {
  final String woNumber;
  final String date;
  final String company;
  final String shift;
  final String typeWo;
  final String priority;
  final String idDivision;
  final String idEquipment;
  final String jobTitle;
  final String runningHours;
  final String jobRequirement;
  final String jobExecutor;
  final String status;
  final String pic;
  final String? attachment;
  final String creator;
  final String createdAt;
  final String? updatedAt;
  final String? assetId;
  final String? assetName;
  final String? divisionName;
  final String? divisionCode;
  final String? categoryMaintenance;
  final String? startedPlanner;
  final String? finishedPlanner;
  final String? estimatePlanner;
  final String? startedActual;
  final String? finishedActual;
  final String? jobExplanation;
  final String? reason;
  final String? sourceTable;

  WorkOrder({
    required this.woNumber,
    required this.date,
    required this.company,
    required this.shift,
    required this.typeWo,
    required this.priority,
    required this.idDivision,
    required this.idEquipment,
    required this.jobTitle,
    required this.runningHours,
    required this.jobRequirement,
    required this.jobExecutor,
    required this.status,
    required this.pic,
    this.attachment,
    required this.creator,
    required this.createdAt,
    this.updatedAt,
    this.assetId,
    this.assetName,
    this.divisionName,
    this.divisionCode,
    this.categoryMaintenance,
    this.startedPlanner,
    this.finishedPlanner,
    this.estimatePlanner,
    this.startedActual,
    this.finishedActual,
    this.jobExplanation,
    this.reason,
    this.sourceTable,
  });

  factory WorkOrder.fromJson(Map<String, dynamic> json) {
    return WorkOrder(
      woNumber: json['wo_number']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      company: json['company']?.toString() ?? '',
      shift: json['shift']?.toString() ?? '',
      typeWo: json['type_wo']?.toString() ?? '',
      priority: json['priority']?.toString() ?? '',
      idDivision: json['id_division']?.toString() ?? '',
      idEquipment: json['id_equipment']?.toString() ?? '',
      jobTitle: json['job_title']?.toString() ?? '',
      runningHours: json['running_hours']?.toString() ?? '',
      jobRequirement: json['job_requirement']?.toString() ?? '',
      jobExecutor: json['job_executor']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      pic: json['pic']?.toString() ?? '',
      attachment: json['attachment']?.toString(),
      creator: json['creator']?.toString() ?? '',
      createdAt: json['created_at']?.toString() ?? '',
      updatedAt: json['updated_at']?.toString(),
      assetId: json['AssetID']?.toString(),
      assetName: json['AssetName']?.toString(),
      divisionName: json['division_name']?.toString(),
      divisionCode: json['division_code']?.toString(),
      categoryMaintenance: json['category_maintenance']?.toString(),
      startedPlanner: json['started_planner']?.toString(),
      finishedPlanner: json['finished_planner']?.toString(),
      estimatePlanner: json['estimate_planner']?.toString(),
      startedActual: json['started_actual']?.toString(),
      finishedActual: json['finished_actual']?.toString(),
      jobExplanation: json['job_explanation']?.toString(),
      reason: json['reason']?.toString(),
      sourceTable: json['source_table']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'wo_number': woNumber,
      'date': date,
      'company': company,
      'shift': shift,
      'type_wo': typeWo,
      'priority': priority,
      'id_division': idDivision,
      'id_equipment': idEquipment,
      'job_title': jobTitle,
      'running_hours': runningHours,
      'job_requirement': jobRequirement,
      'job_executor': jobExecutor,
      'status': status,
      'pic': pic,
      'attachment': attachment,
      'creator': creator,
      'created_at': createdAt,
      'updated_at': updatedAt,
      'AssetID': assetId,
      'AssetName': assetName,
      'division_name': divisionName,
      'division_code': divisionCode,
      'category_maintenance': categoryMaintenance,
      'started_planner': startedPlanner,
      'finished_planner': finishedPlanner,
      'estimate_planner': estimatePlanner,
      'started_actual': startedActual,
      'finished_actual': finishedActual,
      'job_explanation': jobExplanation,
      'reason': reason,
      'source_table': sourceTable,
    };
  }
}

class WorkOrderListResponse {
  final bool status;
  final String message;
  final List<WorkOrder> items;
  final int total;
  final int page;
  final int limit;
  final int totalPages;

  WorkOrderListResponse({
    required this.status,
    required this.message,
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
  });

  factory WorkOrderListResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final items = (data['items'] as List?)
            ?.map((item) => WorkOrder.fromJson(item))
            .toList() ??
        [];

    final pagination = data['pagination'];

    return WorkOrderListResponse(
      status: json['status'] ?? false,
      message: json['message'] ?? '',
      items: items,
      total: int.tryParse(pagination['total']?.toString() ?? '0') ?? 0,
      page: int.tryParse(pagination['page']?.toString() ?? '1') ?? 1,
      limit: int.tryParse(pagination['limit']?.toString() ?? '10') ?? 10,
      totalPages:
          int.tryParse(pagination['total_pages']?.toString() ?? '0') ?? 0,
    );
  }
}

class WorkOrderDetail {
  final WorkOrder workOrder;
  final List<Executor> executors;
  final List<Labor> labor;
  final List<Material> material;
  final List<Approval> approvals;
  final List<PreventivePartExecution> preventiveParts;
  final List<PreventivePartExecution> partExecution;
  final List<PartImage> servicePhotos;

  WorkOrderDetail({
    required this.workOrder,
    required this.executors,
    required this.labor,
    required this.material,
    required this.approvals,
    required this.preventiveParts,
    required this.partExecution,
    required this.servicePhotos,
  });

  factory WorkOrderDetail.fromJson(Map<String, dynamic> json) {
    final data = json['data'];

    return WorkOrderDetail(
      workOrder: WorkOrder.fromJson(data),
      executors: (data['executors'] as List?)
              ?.map((item) => Executor.fromJson(item))
              .toList() ??
          [],
      labor: (data['labor'] as List?)
              ?.map((item) => Labor.fromJson(item))
              .toList() ??
          [],
      material: (data['material'] as List?)
              ?.map((item) => Material.fromJson(item))
              .toList() ??
          [],
      approvals: (data['approvals'] as List?)
              ?.map((item) => Approval.fromJson(item))
              .toList() ??
          [],
      preventiveParts: (data['preventive_parts'] as List?)
              ?.map((item) => PreventivePartExecution.fromJson(item))
              .toList() ??
          [],
      partExecution: (data['part_execution'] as List?)
              ?.map((item) => PreventivePartExecution.fromJson(item))
              .toList() ??
          [],
      servicePhotos: (data['service_photos'] as List?)
              ?.map((item) => PartImage.fromJson(item))
              .toList() ??
          [],
    );
  }
}

class PartImage {
  final String name;
  final String path;
  final String url;

  PartImage({
    required this.name,
    required this.path,
    required this.url,
  });

  factory PartImage.fromJson(Map<String, dynamic> json) {
    return PartImage(
      name: json['name']?.toString() ?? '',
      path: json['path']?.toString() ?? '',
      url: ApiConstants.mediaUrl(json['url']?.toString()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'path': path,
      'url': url,
    };
  }
}

class PartExecutionMedia {
  final int id;
  final int customDetailId;
  final String partMesin;
  final String mediaType;
  final String name;
  final String path;
  final String url;
  final String createdBy;
  final String createdAt;

  PartExecutionMedia({
    required this.id,
    required this.customDetailId,
    required this.partMesin,
    required this.mediaType,
    required this.name,
    required this.path,
    required this.url,
    required this.createdBy,
    required this.createdAt,
  });

  factory PartExecutionMedia.fromJson(Map<String, dynamic> json) {
    final mediaType =
        (json['media_type']?.toString() ?? 'image').toLowerCase().trim();

    return PartExecutionMedia(
      id: int.tryParse(json['id']?.toString() ?? '0') ?? 0,
      customDetailId:
          int.tryParse(json['custom_detail_id']?.toString() ?? '0') ?? 0,
      partMesin: json['part_mesin']?.toString() ?? '',
      mediaType: mediaType == 'video' ? 'video' : 'image',
      name: json['name']?.toString() ?? json['media_name']?.toString() ?? '',
      path: json['path']?.toString() ?? json['media_path']?.toString() ?? '',
      url: ApiConstants.mediaUrl(json['url']?.toString()),
      createdBy: json['created_by']?.toString() ?? '',
      createdAt: json['created_at']?.toString() ?? '',
    );
  }

  PartImage asPartImage() {
    return PartImage(
      name: name,
      path: path,
      url: url,
    );
  }
}

class PreventivePartExecution {
  final int customDetailId;
  final String partMesin;
  final String bagianMesin;
  final String tipeJadwal;
  final String maintenanceStatus;
  final double requestQty;
  final String requestPart;
  final String requestUom;
  final String keterangan;
  final String pic;
  final String kondisi;
  final List<PartImage> tampakJauh;
  final List<PartImage> tampakDekat;
  final List<PartImage> detailPart;
  final List<PartExecutionMedia> executionMedia;

  PreventivePartExecution({
    required this.customDetailId,
    required this.partMesin,
    required this.bagianMesin,
    required this.tipeJadwal,
    required this.maintenanceStatus,
    required this.requestQty,
    required this.requestPart,
    required this.requestUom,
    required this.keterangan,
    required this.pic,
    required this.kondisi,
    required this.tampakJauh,
    required this.tampakDekat,
    required this.detailPart,
    required this.executionMedia,
  });

  factory PreventivePartExecution.fromJson(Map<String, dynamic> json) {
    final customDetailIdRaw = json['custom_detail_id'] ?? json['id'];
    final maintenanceStatus =
        (json['maintenance_status']?.toString() ?? 'PENDING').toUpperCase();

    return PreventivePartExecution(
      customDetailId: int.tryParse(customDetailIdRaw?.toString() ?? '0') ?? 0,
      partMesin: json['part_mesin']?.toString() ?? '',
      bagianMesin:
          json['bagian_mesin']?.toString() ?? json['bagian']?.toString() ?? '',
      tipeJadwal: json['tipe_jadwal']?.toString() ?? '',
      maintenanceStatus: maintenanceStatus == 'DONE' ? 'DONE' : 'PENDING',
      requestQty: double.tryParse(json['request_qty']?.toString() ?? '0') ?? 0,
      requestPart: json['request_part']?.toString() ??
          json['part_mesin']?.toString() ??
          '',
      requestUom: json['request_uom']?.toString() ?? 'PCS',
      keterangan: json['keterangan']?.toString() ?? '',
      pic: json['pic']?.toString() ?? '',
      kondisi: json['kondisi']?.toString() ?? '',
      tampakJauh: (json['tampak_jauh'] as List?)
              ?.map((item) => PartImage.fromJson(item))
              .toList() ??
          [],
      tampakDekat: (json['tampak_dekat'] as List?)
              ?.map((item) => PartImage.fromJson(item))
              .toList() ??
          [],
      detailPart: (json['detail_part'] as List?)
              ?.map((item) => PartImage.fromJson(item))
              .toList() ??
          [],
      executionMedia: (json['execution_media'] as List?)
              ?.map((item) => PartExecutionMedia.fromJson(item))
              .toList() ??
          [],
    );
  }

  PreventivePartExecution copyWith({
    int? customDetailId,
    String? partMesin,
    String? bagianMesin,
    String? tipeJadwal,
    String? maintenanceStatus,
    double? requestQty,
    String? requestPart,
    String? requestUom,
    String? keterangan,
    String? pic,
    String? kondisi,
    List<PartImage>? tampakJauh,
    List<PartImage>? tampakDekat,
    List<PartImage>? detailPart,
    List<PartExecutionMedia>? executionMedia,
  }) {
    return PreventivePartExecution(
      customDetailId: customDetailId ?? this.customDetailId,
      partMesin: partMesin ?? this.partMesin,
      bagianMesin: bagianMesin ?? this.bagianMesin,
      tipeJadwal: tipeJadwal ?? this.tipeJadwal,
      maintenanceStatus: maintenanceStatus ?? this.maintenanceStatus,
      requestQty: requestQty ?? this.requestQty,
      requestPart: requestPart ?? this.requestPart,
      requestUom: requestUom ?? this.requestUom,
      keterangan: keterangan ?? this.keterangan,
      pic: pic ?? this.pic,
      kondisi: kondisi ?? this.kondisi,
      tampakJauh: tampakJauh ?? this.tampakJauh,
      tampakDekat: tampakDekat ?? this.tampakDekat,
      detailPart: detailPart ?? this.detailPart,
      executionMedia: executionMedia ?? this.executionMedia,
    );
  }

  Map<String, dynamic> toPayloadJson() {
    return {
      'custom_detail_id': customDetailId,
      'part_mesin': partMesin,
      'bagian_mesin': bagianMesin,
      'maintenance_status': maintenanceStatus,
      'request_qty': requestQty,
      'request_part': requestPart,
      'request_uom': requestUom,
      'keterangan': keterangan,
    };
  }
}

class Executor {
  final String id;
  final String woNumber;
  final String jobExecutor;
  final String status;
  final String? jobExplanation;
  final String createdAt;

  Executor({
    required this.id,
    required this.woNumber,
    required this.jobExecutor,
    required this.status,
    this.jobExplanation,
    required this.createdAt,
  });

  factory Executor.fromJson(Map<String, dynamic> json) {
    return Executor(
      id: json['id']?.toString() ?? '',
      woNumber: json['wo_number']?.toString() ?? '',
      jobExecutor: json['job_executor']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      jobExplanation: json['job_explanation']?.toString(),
      createdAt: json['created_at']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'status': status,
      'job_explanation': jobExplanation,
      'created_at': createdAt,
    };
  }
}

class Labor {
  final String id;
  final String woNumber;
  final String jobExecutor;
  final String trade;
  final int men;
  final double hours;
  final String forType;

  Labor({
    required this.id,
    required this.woNumber,
    required this.jobExecutor,
    required this.trade,
    required this.men,
    required this.hours,
    required this.forType,
  });

  factory Labor.fromJson(Map<String, dynamic> json) {
    return Labor(
      id: json['id_detail_labor']?.toString() ?? json['id']?.toString() ?? '',
      woNumber: json['wo_number']?.toString() ?? '',
      jobExecutor: json['job_executor']?.toString() ?? '',
      trade: json['trade']?.toString() ?? '',
      men: int.tryParse(json['men']?.toString() ?? '0') ?? 0,
      hours: double.tryParse(json['hours']?.toString() ?? '0') ?? 0,
      forType: json['for']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_detail_labor': id,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'trade': trade,
      'men': men,
      'hours': hours,
      'for': forType,
    };
  }
}

class Material {
  final String id;
  final String woNumber;
  final String jobExecutor;
  final String material;
  final String unit;
  final double qty;
  final String? pr;
  final String? level;

  Material({
    required this.id,
    required this.woNumber,
    required this.jobExecutor,
    required this.material,
    required this.unit,
    required this.qty,
    this.pr,
    this.level,
  });

  factory Material.fromJson(Map<String, dynamic> json) {
    return Material(
      id: json['id_detail_material']?.toString() ??
          json['id']?.toString() ??
          '',
      woNumber: json['wo_number']?.toString() ?? '',
      jobExecutor: json['job_executor']?.toString() ?? '',
      material: json['material']?.toString() ?? '',
      unit: json['unit']?.toString() ?? '',
      qty: double.tryParse(json['qty']?.toString() ?? '0') ?? 0,
      pr: json['pr']?.toString(),
      level: json['level']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'wo_number': woNumber,
      'job_executor': jobExecutor,
      'material': material,
      'unit': unit,
      'qty': qty,
      'pr': pr,
      'level': level,
    };
  }
}

class Approval {
  final String woNumber;
  final String fullname;
  final String alias;
  final String? avatar;
  final String idDivision;
  final String idPosition;
  final String comment;
  final String createdAt;

  Approval({
    required this.woNumber,
    required this.fullname,
    this.alias = '',
    this.avatar,
    required this.idDivision,
    required this.idPosition,
    required this.comment,
    required this.createdAt,
  });

  factory Approval.fromJson(Map<String, dynamic> json) {
    return Approval(
      woNumber: json['wo_number']?.toString() ?? '',
      fullname: json['fullname']?.toString() ?? '',
      alias: json['alias']?.toString() ?? '',
      avatar: json['avatar']?.toString(),
      idDivision: json['id_division']?.toString() ?? '',
      idPosition: json['id_position']?.toString() ?? '',
      comment: json['comment']?.toString() ?? '',
      createdAt: json['created_at']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'wo_number': woNumber,
      'fullname': fullname,
      'alias': alias,
      'avatar': avatar,
      'id_division': idDivision,
      'id_position': idPosition,
      'comment': comment,
      'created_at': createdAt,
    };
  }
}

class DashboardStats {
  final int open;
  final int inProgress;
  final int closed;
  final int total;
  final double openPercentage;
  final double progressPercentage;
  final double closedPercentage;

  DashboardStats({
    required this.open,
    required this.inProgress,
    required this.closed,
    required this.total,
    required this.openPercentage,
    required this.progressPercentage,
    required this.closedPercentage,
  });

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    final data = json['data'];

    return DashboardStats(
      open: int.tryParse(data['open']?.toString() ?? '0') ?? 0,
      inProgress: int.tryParse(data['in_progress']?.toString() ?? '0') ?? 0,
      closed: int.tryParse(data['closed']?.toString() ?? '0') ?? 0,
      total: int.tryParse(data['total']?.toString() ?? '0') ?? 0,
      openPercentage:
          double.tryParse(data['open_percentage']?.toString() ?? '0') ?? 0.0,
      progressPercentage:
          double.tryParse(data['progress_percentage']?.toString() ?? '0') ??
              0.0,
      closedPercentage:
          double.tryParse(data['closed_percentage']?.toString() ?? '0') ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'open': open,
      'in_progress': inProgress,
      'closed': closed,
      'total': total,
      'open_percentage': openPercentage,
      'progress_percentage': progressPercentage,
      'closed_percentage': closedPercentage,
    };
  }
}

class UserModel {
  final String idUser;
  final String fullname;
  final String? email;
  final String? avatar;
  final String idDivision;
  final String idPosition;
  final String? divisionName;
  final String? divisionCode;

  UserModel({
    required this.idUser,
    required this.fullname,
    this.email,
    this.avatar,
    required this.idDivision,
    required this.idPosition,
    this.divisionName,
    this.divisionCode,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      idUser: json['id_user']?.toString() ?? '',
      fullname: json['fullname']?.toString() ?? '',
      email: json['email']?.toString(),
      avatar: json['avatar']?.toString(),
      idDivision: json['id_division']?.toString() ?? '',
      idPosition: json['id_position']?.toString() ?? '',
      divisionName: json['division_name']?.toString(),
      divisionCode: json['division_code']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id_user': idUser,
      'fullname': fullname,
      'email': email,
      'avatar': avatar,
      'id_division': idDivision,
      'id_position': idPosition,
      'division_name': divisionName,
      'division_code': divisionCode,
    };
  }
}

class ApiResponse {
  final bool status;
  final String message;
  final dynamic data;

  ApiResponse({
    required this.status,
    required this.message,
    this.data,
  });

  factory ApiResponse.fromJson(Map<String, dynamic> json) {
    return ApiResponse(
      status: json['status'] ?? false,
      message: json['message'] ?? '',
      data: json['data'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'message': message,
      'data': data,
    };
  }
}
