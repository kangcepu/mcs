import '../providers/api_service.dart';

class PreventiveNcrItem {
  final int id;
  final String number,
      type,
      severity,
      module,
      woNumber,
      assetCode,
      title,
      description,
      status;
  final String? triggerWo,
      plannedDate,
      assignedTo,
      rootCause,
      correctiveAction,
      preventiveAction,
      resolutionNote;
  const PreventiveNcrItem(
      {required this.id,
      required this.number,
      required this.type,
      required this.severity,
      required this.module,
      required this.woNumber,
      required this.assetCode,
      required this.title,
      required this.description,
      required this.status,
      this.triggerWo,
      this.plannedDate,
      this.assignedTo,
      this.rootCause,
      this.correctiveAction,
      this.preventiveAction,
      this.resolutionNote});
  factory PreventiveNcrItem.fromJson(Map<String, dynamic> json) =>
      PreventiveNcrItem(
          id: int.tryParse('${json['id']}') ?? 0,
          number: '${json['ncr_number'] ?? '-'}',
          type: '${json['ncr_type'] ?? '-'}',
          severity: '${json['severity'] ?? '-'}',
          module: '${json['module_code'] ?? '-'}',
          woNumber: '${json['wo_number'] ?? '-'}',
          assetCode: '${json['asset_code'] ?? '-'}',
          title: '${json['title'] ?? '-'}',
          description: '${json['description'] ?? '-'}',
          status: '${json['status'] ?? 'OPEN'}',
          triggerWo: json['trigger_wo_number']?.toString(),
          plannedDate: json['planned_date']?.toString(),
          assignedTo: json['assigned_to']?.toString(),
          rootCause: json['root_cause']?.toString(),
          correctiveAction: json['corrective_action']?.toString(),
          preventiveAction: json['preventive_action']?.toString(),
          resolutionNote: json['resolution_note']?.toString());
}

class PreventiveNcrRepository {
  final ApiService _api = ApiService();
  Future<List<PreventiveNcrItem>> list(
      {String q = '', String status = '', String type = ''}) async {
    final response = await _api.get('/v2/preventive-ncr', queryParameters: {
      'q': q,
      'status': status,
      'type': type,
      'per_page': 100
    });
    final body = response.data;
    final data = body is Map ? body['data'] : null;
    final items = data is Map ? data['items'] : null;
    return items is List
        ? items
            .whereType<Map>()
            .map(
                (e) => PreventiveNcrItem.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : const [];
  }

  Future<void> update(int id, Map<String, dynamic> data) async =>
      _api.patch('/v2/preventive-ncr/$id', data: data);
}
