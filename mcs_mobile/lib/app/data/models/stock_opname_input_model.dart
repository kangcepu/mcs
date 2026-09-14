// models/stock_opname_input_model.dart

class StockOpnameInputModel {
  final String idLokasi;
  final String blok;

  StockOpnameInputModel({required this.idLokasi, required this.blok});

  factory StockOpnameInputModel.fromJson(Map<String, dynamic> json) {
    return StockOpnameInputModel(
      idLokasi: json['IdLokasi'] as String,
      blok: json['Blok'] as String,
    );
  }
}
