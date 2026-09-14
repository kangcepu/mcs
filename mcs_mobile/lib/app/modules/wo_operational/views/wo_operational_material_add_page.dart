import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_material_controller.dart';

class WoOperationalMaterialAddPage extends GetView<WoOperationalMaterialController> {
  const WoOperationalMaterialAddPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'Add Material',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
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
              _buildSection('Material Information'),
              _buildTextField('WO Number', controller.woNumberController, readOnly: true),
              _buildTextField('Job Executor', controller.jobExecutorController),
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextFormField(
                      controller: controller.materialController,
                      decoration: InputDecoration(
                        labelText: 'Material',
                        hintText: 'Ketik nama part/material',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onChanged: controller.onMaterialChanged,
                      validator: (value) =>
                          value?.isEmpty ?? true ? 'Material is required' : null,
                    ),
                    Obx(() {
                      if (controller.isSearchingMaterial.value) {
                        return const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: LinearProgressIndicator(minHeight: 2),
                        );
                      }
                      if (controller.materialSuggestions.isEmpty) {
                        return const SizedBox.shrink();
                      }
                      return Container(
                        margin: const EdgeInsets.only(top: 8),
                        constraints: const BoxConstraints(maxHeight: 180),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFDDE3EA)),
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: controller.materialSuggestions.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final suggestion =
                                controller.materialSuggestions[index];
                            return ListTile(
                              dense: true,
                              title: Text(
                                suggestion,
                                style: const TextStyle(fontSize: 13),
                              ),
                              onTap: () =>
                                  controller.applyMaterialSuggestion(suggestion),
                            );
                          },
                        ),
                      );
                    }),
                  ],
                ),
              ),
              _buildTextField('Unit', controller.unitController),
              _buildTextField('Quantity', controller.qtyController, keyboardType: TextInputType.number),
              _buildTextField('PR Number (Optional)', controller.prController),
              const SizedBox(height: 32),
              Obx(() => SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: controller.isLoading.value ? null : controller.addMaterial,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00b894),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: controller.isLoading.value
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Add Material', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
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
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF2d3436)),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController textController, {bool readOnly = false, TextInputType? keyboardType}) {
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
        validator: (value) {
          if (label.contains('Optional')) return null;
          return value?.isEmpty ?? true ? '$label is required' : null;
        },
      ),
    );
  }

}
