class NextNoSOModel {
  final String nextNoSO;

  NextNoSOModel({required this.nextNoSO});

  // Factory untuk mengonversi JSON ke model
  factory NextNoSOModel.fromJson(Map<String, dynamic> json) {
    return NextNoSOModel(
      nextNoSO: json['nextNoSO'] ?? "Data tidak tersedia.",
    );
  }
}