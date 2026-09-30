String twoLineDateLabel(String label) {
  final match = RegExp(r'^(\d{1,2}/\d{1,2})/(\d{4})$').firstMatch(label.trim());
  if (match == null) return label;
  return '${match.group(1)}\n${match.group(2)}';
}
