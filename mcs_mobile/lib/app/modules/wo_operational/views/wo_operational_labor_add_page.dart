import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_labor_controller.dart';
import 'package:multi_select_flutter/multi_select_flutter.dart';

class WoOperationalLaborAddPage extends GetView<WoOperationalLaborController> {
  const WoOperationalLaborAddPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'Add Labor',
          style: TextStyle(
              color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF00b894),
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Get.back(),
        ),
      ),
      body: Form(
        key: controller.formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSection('Labor Information'),
              _buildTextField('WO Number', controller.woNumberController,
                  readOnly: true),
              _buildTextField('Job Executor', controller.jobExecutorController),
              Obx(() {
                if (controller.isLoadingPics.value) {
                  return const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: LinearProgressIndicator(minHeight: 2),
                  );
                }

                if (controller.picOptions.isEmpty) {
                  return _buildTextField('PIC', controller.tradeController);
                }

                return _buildMultiSelectDropdown();
              }),
              _buildTextField('Men', controller.menController,
                  keyboardType: TextInputType.number),
              _buildTextField('Hours', controller.hoursController,
                  keyboardType: TextInputType.number),
              const SizedBox(height: 32),
              Obx(() => SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: controller.isLoading.value
                          ? null
                          : controller.addLabor,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00b894),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      child: controller.isLoading.value
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Add Labor',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  )),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSection(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Text(
        title,
        style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Color(0xFF2d3436)),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController textController,
      {bool readOnly = false, TextInputType? keyboardType}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: textController,
        readOnly: readOnly,
        keyboardType: keyboardType,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        validator: (value) =>
            value?.isEmpty ?? true ? '$label is required' : null,
      ),
    );
  }

  Widget _buildDropdown(String label, TextEditingController textController,
      List<String> items, Function(String) onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<String>(
        value: textController.text.isEmpty ? null : textController.text,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        items: items
            .map((item) => DropdownMenuItem(value: item, child: Text(item)))
            .toList(),
        onChanged: (value) {
          if (value != null) onChanged(value);
        },
        validator: (value) => value == null ? '$label is required' : null,
      ),
    );
  }

  Widget _buildMultiSelectDropdown() {
  return Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Obx(() => MultiSelectDialogField<String>(
          title: const Text("Pilih PIC"),
          searchable: true,

          buttonText: const Text(
            "Pilih PIC",
            overflow: TextOverflow.ellipsis,
          ),

          items: controller.picOptions
              .map((e) => MultiSelectItem<String>(e, e))
              .toList(),

          initialValue: controller.selectedPics,

          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade400),
          ),

          onConfirm: (values) {
            if (values.length > 10) {
              Get.snackbar(
                "Warning",
                "Maksimal 10 user",
                snackPosition: SnackPosition.BOTTOM,
              );
              return;
            }

            controller.selectedPics.value = values;
          },

          chipDisplay: MultiSelectChipDisplay(
            chipColor: Colors.blue.shade50,
            textStyle: const TextStyle(color: Colors.black),
            onTap: (value) {
              controller.selectedPics.remove(value);
            },
          ),
        )),
  );
}
}
