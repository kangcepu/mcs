import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

class WoMaterialDialogResult {
  const WoMaterialDialogResult({
    required this.material,
    required this.qty,
    required this.unit,
    required this.pr,
  });

  final String material;
  final double qty;
  final String unit;
  final String pr;
}

class WoMaterialDialog extends StatefulWidget {
  const WoMaterialDialog({
    super.key,
    required this.onSearchMaterial,
    required this.onGetMaterialUom,
    this.title = 'Add Material',
    this.initialMaterial = '',
    this.initialQty = 1,
    this.initialUnit = 'PCS',
    this.initialPr = '',
  });

  final Future<List<String>> Function(String keyword) onSearchMaterial;
  final Future<String?> Function(String materialName) onGetMaterialUom;
  final String title;
  final String initialMaterial;
  final double initialQty;
  final String initialUnit;
  final String initialPr;

  static Future<WoMaterialDialogResult?> show({
    required Future<List<String>> Function(String keyword) onSearchMaterial,
    required Future<String?> Function(String materialName) onGetMaterialUom,
    String title = 'Add Material',
    String initialMaterial = '',
    double initialQty = 1,
    String initialUnit = 'PCS',
    String initialPr = '',
  }) {
    return Get.dialog<WoMaterialDialogResult>(
      WoMaterialDialog(
        onSearchMaterial: onSearchMaterial,
        onGetMaterialUom: onGetMaterialUom,
        title: title,
        initialMaterial: initialMaterial,
        initialQty: initialQty,
        initialUnit: initialUnit,
        initialPr: initialPr,
      ),
    );
  }

  @override
  State<WoMaterialDialog> createState() => _WoMaterialDialogState();
}

class _WoMaterialDialogState extends State<WoMaterialDialog> {
  late final TextEditingController _materialController;
  late final TextEditingController _qtyController;
  late final TextEditingController _unitController;
  late final TextEditingController _prController;

  final List<String> _suggestions = <String>[];
  bool _isSearching = false;
  String? _searchError;
  bool _suppressSearch = false;
  bool _materialSelectedFromSuggestion = false;
  int _searchToken = 0;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _materialController = TextEditingController(text: widget.initialMaterial);
    _qtyController = TextEditingController(
      text: widget.initialQty.toStringAsFixed(
        widget.initialQty.truncateToDouble() == widget.initialQty ? 0 : 2,
      ),
    );
    _unitController = TextEditingController(text: widget.initialUnit);
    _prController = TextEditingController(text: widget.initialPr);
    _materialSelectedFromSuggestion = widget.initialMaterial.trim().isNotEmpty;
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _materialController.dispose();
    _qtyController.dispose();
    _unitController.dispose();
    _prController.dispose();
    super.dispose();
  }

  void _onMaterialChanged(String value) {
    if (_suppressSearch) {
      return;
    }

    final hasInitialValue = widget.initialMaterial.trim().isNotEmpty;
    final normalizedValue = value.trim().toLowerCase();
    final normalizedInitial = widget.initialMaterial.trim().toLowerCase();
    final isSameAsInitial = hasInitialValue && normalizedValue == normalizedInitial;

    if (_materialSelectedFromSuggestion || !isSameAsInitial) {
      _materialSelectedFromSuggestion = isSameAsInitial;
    }

    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 220), () {
      _searchSuggestions(value);
    });
  }

  Future<void> _searchSuggestions(String keyword) async {
    final query = keyword.trim();
    if (query.isEmpty) {
      if (!mounted) return;
      setState(() {
        _suggestions.clear();
        _isSearching = false;
        _searchError = null;
      });
      return;
    }

    final int currentToken = ++_searchToken;
    if (mounted) {
      setState(() {
        _isSearching = true;
        _searchError = null;
      });
    }

    try {
      final result = await widget.onSearchMaterial(query);
      if (!mounted || currentToken != _searchToken) {
        return;
      }

      setState(() {
        _suggestions
          ..clear()
          ..addAll(result);
        _isSearching = false;
        _searchError = null;
      });
    } catch (e) {
      if (!mounted || currentToken != _searchToken) {
        return;
      }
      setState(() {
        _suggestions.clear();
        _isSearching = false;
        _searchError = 'Gagal mencari material. Coba lagi.';
      });
    }
  }

  Future<void> _applySuggestion(String selected) async {
    _suppressSearch = true;
    _materialController.value = TextEditingValue(
      text: selected,
      selection: TextSelection.collapsed(offset: selected.length),
    );

    if (mounted) {
      setState(() {
        _suggestions.clear();
        _isSearching = false;
        _searchError = null;
        _materialSelectedFromSuggestion = true;
      });
    }

    final uom = await widget.onGetMaterialUom(selected);
    if (!mounted) {
      return;
    }
    if (uom != null && uom.trim().isNotEmpty) {
      _unitController.text = uom.trim();
    }
    Future.delayed(const Duration(milliseconds: 150), () {
      _suppressSearch = false;
    });
  }

  double? _parseQtyInput(String rawText) {
    final raw = rawText.trim();
    if (raw.isEmpty) {
      return widget.initialQty;
    }

    final normalized = raw.replaceAll(' ', '').replaceAll(',', '.');
    return double.tryParse(normalized);
  }

  void _submit() {
    final material = _materialController.text.trim();
    if (material.isEmpty) {
      Get.snackbar('Error', 'Material harus diisi');
      return;
    }
    if (!_materialSelectedFromSuggestion) {
      Get.snackbar('Error', 'Pilih material dari hasil pencarian database');
      return;
    }

    final parsedQty = _parseQtyInput(_qtyController.text);
    if (parsedQty == null) {
      Get.snackbar('Error', 'Qty harus berupa angka');
      return;
    }
    if (parsedQty <= 0) {
      Get.snackbar('Error', 'Qty harus lebih dari 0');
      return;
    }
    final qty = parsedQty;
    final unit = _unitController.text.trim().isEmpty
        ? 'PCS'
        : _unitController.text.trim();
    final pr = _prController.text.trim();

    Get.back(
      result: WoMaterialDialogResult(
        material: material,
        qty: qty,
        unit: unit,
        pr: pr,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      backgroundColor: const Color(0xFFF8FAFF),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.82,
          maxWidth: 520,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.max,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1E293B),
                ),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: _materialController,
                        style: const TextStyle(color: Color(0xFF1F2937)),
                        decoration: const InputDecoration(
                          labelText: 'Material',
                          border: OutlineInputBorder(),
                          hintText: 'Cari lalu pilih material/part',
                          labelStyle: TextStyle(color: Color(0xFF64748B)),
                          hintStyle: TextStyle(color: Color(0xFF94A3B8)),
                        ),
                        onChanged: _onMaterialChanged,
                      ),
                      if (!_materialSelectedFromSuggestion &&
                          _materialController.text.trim().isNotEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Material harus dipilih dari hasil pencarian.',
                              style: TextStyle(
                                color: Colors.red,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      if (_isSearching)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: LinearProgressIndicator(minHeight: 2),
                        ),
                      if (_searchError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _searchError!,
                              style: const TextStyle(
                                color: Colors.red,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      if (_suggestions.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 8),
                          constraints: const BoxConstraints(maxHeight: 200),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border.all(color: const Color(0xFFDDE3EA)),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: ListView.separated(
                            shrinkWrap: true,
                            itemCount: _suggestions.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, index) {
                              final item = _suggestions[index];
                              return ListTile(
                                dense: true,
                                title: Text(
                                  item,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF1F2937),
                                  ),
                                ),
                                onTap: () => _applySuggestion(item),
                              );
                            },
                          ),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _qtyController,
                              style: const TextStyle(color: Color(0xFF1F2937)),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Qty',
                                border: OutlineInputBorder(),
                                labelStyle: TextStyle(color: Color(0xFF64748B)),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _unitController,
                              style: const TextStyle(color: Color(0xFF1F2937)),
                              decoration: const InputDecoration(
                                labelText: 'Unit',
                                border: OutlineInputBorder(),
                                labelStyle: TextStyle(color: Color(0xFF64748B)),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _prController,
                        style: const TextStyle(color: Color(0xFF1F2937)),
                        decoration: const InputDecoration(
                          labelText: 'PR Number (Optional)',
                          border: OutlineInputBorder(),
                          labelStyle: TextStyle(color: Color(0xFF64748B)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Get.back(),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _submit,
                    child: const Text('Add'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
