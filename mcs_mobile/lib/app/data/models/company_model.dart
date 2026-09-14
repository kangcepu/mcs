class Company {
  final String companyId;
  final String companyName;

  Company({required this.companyId, required this.companyName});

  factory Company.fromJson(Map<String, dynamic> json) {
    return Company(
      companyId: json['companyId'],
      companyName: json['companyName'],
    );
  }
}
