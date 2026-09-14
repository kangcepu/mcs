import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_update_controller.dart';

class WoOperationalUpdatePage extends GetView<WoOperationalUpdateController> {
  const WoOperationalUpdatePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'Update Work Order',
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
              _buildSection('WO Information'),
              _buildTextField('WO Number', controller.woNumberController,
                  readOnly: true),
              _buildDateField('Date', controller.dateController),
              _buildDropdown('Company', controller.companyController,
                  ['UC', 'UC1', 'UC2'], controller.setCompany),
              _buildDropdown('Shift', controller.shiftController,
                  ['1', '2', '3'], controller.setShift),
              _buildDropdown(
                  'Type WO',
                  controller.typeWoController,
                  ['PREV MAINTENANCE', 'CORRECTIVE MAINTENANCE', 'PROJECT'],
                  controller.setTypeWo),
              _buildDropdown(
                  'Priority',
                  controller.priorityController,
                  ['Low', 'Medium', 'High', 'Critical'],
                  controller.setPriority),
              const SizedBox(height: 24),
              _buildSection('Equipment & Job'),
              _buildTextField('Equipment ID', controller.idEquipmentController),
              _buildTextField('Job Title', controller.jobTitleController),
              _buildTextField(
                  'Running Hours', controller.runningHoursController,
                  keyboardType: TextInputType.number),
              _buildTextField(
                  'Job Requirement', controller.jobRequirementController,
                  maxLines: 4),
              const SizedBox(height: 24),
              _buildSection('Attachment'),
              _buildAttachmentSection(),
              const SizedBox(height: 32),
              Obx(() => SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: controller.isLoading.value
                          ? null
                          : controller.updateWo,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00b894),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      child: controller.isLoading.value
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Update Work Order',
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
      {bool readOnly = false, int maxLines = 1, TextInputType? keyboardType}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: textController,
        readOnly: readOnly,
        maxLines: maxLines,
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

  Widget _buildDateField(String label, TextEditingController textController) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: textController,
        readOnly: true,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          suffixIcon: const Icon(Icons.calendar_today),
        ),
        onTap: () async {
          final date = await showDatePicker(
            context: Get.context!,
            initialDate: DateTime.now(),
            firstDate: DateTime(2020),
            lastDate: DateTime(2030),
          );
          if (date != null) {
            textController.text =
                '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
          }
        },
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

  Widget _buildAttachmentSection() {
    return Obx(() => Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey[300]!),
          ),
          child: Column(
            children: [
              if (controller.existingAttachment.value.isNotEmpty &&
                  controller.attachmentFile.value == null)
                Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F7FA),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.attachment,
                              color: Color(0xFF00b894)),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(controller.existingAttachment.value)),
                          IconButton(
                            icon: const Icon(Icons.close, color: Colors.red),
                            onPressed: controller.removeAttachment,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              if (controller.attachmentFile.value != null)
                Column(
                  children: [
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(
                            File(controller.attachmentPath.value),
                            height: 200,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 8,
                          right: 8,
                          child: IconButton(
                            icon: const Icon(Icons.close, color: Colors.white),
                            onPressed: controller.removeAttachment,
                            style: IconButton.styleFrom(
                                backgroundColor: Colors.red),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: controller.pickImage,
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Gallery'),
                      style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF00b894)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: controller.takePhoto,
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Camera'),
                      style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF00b894)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ));
  }
}
