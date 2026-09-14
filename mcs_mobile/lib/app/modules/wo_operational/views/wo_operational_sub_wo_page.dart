import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_sub_wo_controller.dart';

class WoOperationalSubWoPage extends GetView<WoOperationalSubWoController> {
  const WoOperationalSubWoPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'Create Sub Work Order',
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
              _buildSection('Sub Work Order Information'),
              _buildTextField('WO Number', controller.woNumberController, readOnly: true),
              const SizedBox(height: 24),
              _buildSection('Select Department'),
              Obx(() => Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey[300]!),
                    ),
                    child: Column(
                      children: controller.subtoOptions.map((option) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: controller.selectedSubto.value == option['value']
                                ? const Color(0xFF00b894).withOpacity(0.1)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: controller.selectedSubto.value == option['value']
                                  ? const Color(0xFF00b894)
                                  : Colors.grey[300]!,
                            ),
                          ),
                          child: RadioListTile<String>(
                            title: Text(
                              option['label']!,
                              style: TextStyle(
                                fontWeight: controller.selectedSubto.value == option['value']
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                controller.getSubtoDescription(option['value']!),
                                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                              ),
                            ),
                            value: option['value']!,
                            groupValue: controller.selectedSubto.value,
                            onChanged: (value) => controller.setSubto(value!),
                            activeColor: const Color(0xFF00b894),
                          ),
                        );
                      }).toList(),
                    ),
                  )),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: Colors.blue[700]),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'A new sub work order will be created and automatically forwarded to the selected department.',
                        style: TextStyle(fontSize: 13, color: Colors.blue[900]),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              Obx(() => SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: controller.isLoading.value ? null : controller.createSubWo,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00b894),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: controller.isLoading.value
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Create Sub Work Order', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
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

  Widget _buildTextField(String label, TextEditingController textController, {bool readOnly = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: textController,
        readOnly: readOnly,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        validator: (value) => value?.isEmpty ?? true ? '$label is required' : null,
      ),
    );
  }
}
