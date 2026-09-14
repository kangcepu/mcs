class UpdateWoRequest {
  final String date;
  final String company;
  final String? shift;
  final String jobTitle;
  final String? typeWo;
  final String? priority;
  final String? runningHours;
  final String jobRequirement;
  final List<AttachmentFile>? attachments;

  UpdateWoRequest({
    required this.date,
    required this.company,
    this.shift,
    required this.jobTitle,
    this.typeWo,
    this.priority,
    this.runningHours,
    required this.jobRequirement,
    this.attachments,
  });

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> data = {
      'date': date,
      'company': company,
      'job_title': jobTitle,
      'job_requirement': jobRequirement,
    };

    if (shift != null) data['shift'] = shift;
    if (typeWo != null) data['type_wo'] = typeWo;
    if (priority != null) data['priority'] = priority;
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
}
