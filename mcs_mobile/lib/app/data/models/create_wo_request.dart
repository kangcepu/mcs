import 'dart:io';

class CreateWoRequest {
  final String? woNumber;
  final String date;
  final String? idEquipment;
  final String company;
  final String? shift;
  final String jobTitle;
  final String typeWo;
  final String priority;
  final String? runningHours;
  final String jobRequirement;
  final List<AttachmentFile>? attachments;

  CreateWoRequest({
    this.woNumber,
    required this.date,
    this.idEquipment,
    required this.company,
    this.shift,
    required this.jobTitle,
    required this.typeWo,
    required this.priority,
    this.runningHours,
    required this.jobRequirement,
    this.attachments,
  });

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> data = {
      'date': date,
      'company': company,
      'job_title': jobTitle,
      'type_wo': typeWo,
      'priority': priority,
      'job_requirement': jobRequirement,
    };

    if (woNumber != null) data['wo_number'] = woNumber;
    if (idEquipment != null) data['id_equipment'] = idEquipment;
    if (shift != null) data['shift'] = shift;
    if (runningHours != null) data['running_hours'] = runningHours;

    if (attachments != null && attachments!.isNotEmpty) {
      data['attachments'] = attachments!.map((file) => file.toJson()).toList();
    }

    return data;
  }
}

class AttachmentFile {
  final String base64;
  final String filename;

  AttachmentFile({
    required this.base64,
    required this.filename,
  });

  Map<String, dynamic> toJson() {
    return {
      'base64': base64,
      'filename': filename,
    };
  }

  factory AttachmentFile.fromFile(File file, String base64String) {
    return AttachmentFile(
      base64: base64String,
      filename: file.path.split('/').last,
    );
  }
}
