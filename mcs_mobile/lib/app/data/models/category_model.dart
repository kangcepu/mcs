class Category {
  final String categoryCode;
  final String categoryName;

  Category({required this.categoryCode, required this.categoryName});

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      categoryCode: json['categoryCode'],
      categoryName: json['categoryName'],
    );
  }
}
