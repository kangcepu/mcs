import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_job_explanation_controller.dart';

class WoOperationalJobExplanationPage extends GetView<WoOperationalJobExplanationController> {
  const WoOperationalJobExplanationPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'Job Explanation',
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
              _buildSection('Job Information'),
              _buildTextField('WO Number', controller.woNumberController, readOnly: true),
              _buildTextField('Job Explanation', controller.jobExplanationController, maxLines: 4),
              const SizedBox(height: 24),
              _buildSection('Status'),
              Obx(() => Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey[300]!),
                    ),
                    child: Column(
                      children: controller.statusOptions.map((status) {
                        return RadioListTile<String>(
                          title: Text(controller.getStatusLabel(status)),
                          value: status,
                          groupValue: controller.selectedStatus.value,
                          onChanged: (value) => controller.setStatus(value!),
                          activeColor: const Color(0xFF00b894),
                        );
                      }).toList(),
                    ),
                  )),
              const SizedBox(height: 24),
              _buildSection('Planning Time'),
              _buildDateField('Started Planner', controller.startedPlannerController),
              _buildTimeField('Started Actual Time', controller.startedActualTimeController),
              _buildDateField('Finished Planner', controller.finishedPlannerController),
              _buildTimeField('Finished Actual Time', controller.finishedActualTimeController),
              _buildTextField('Estimate Planner (hours)', controller.estimatePlannerController, keyboardType: TextInputType.number),
              _buildSection('Service Evidence Photo'),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: controller.pickServicePhotoFromCamera,
                      icon: const Icon(Icons.photo_camera),
                      label: const Text('Camera'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: controller.pickServicePhotosFromGallery,
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Gallery'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Obx(
                () => Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${controller.selectedServicePhotoPaths.length} foto dipilih',
                    style: TextStyle(
                      fontSize: 12,
                      color: controller.selectedServicePhotoPaths.isEmpty
                          ? Colors.red
                          : Colors.green,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Obx(
                () => Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(
                    controller.selectedServicePhotoPaths.length,
                    (index) {
                      final fileName = controller.selectedServicePhotoPaths[index]
                          .split(RegExp(r'[\\/]'))
                          .last;
                      return InputChip(
                        label: Text(fileName, overflow: TextOverflow.ellipsis),
                        onDeleted: () => controller.removeServicePhotoAt(index),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: 32),
              Obx(() => SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: controller.isLoading.value
                          ? null
                          : () => controller.submitJobExplanation(
                                servicePhotoPaths:
                                    controller.selectedServicePhotoPaths.toList(),
                              ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00b894),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: controller.isLoading.value
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Submit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
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

  Widget _buildTextField(String label, TextEditingController textController, {bool readOnly = false, int maxLines = 1, TextInputType? keyboardType}) {
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
        validator: (value) => value?.isEmpty ?? true ? '$label is required' : null,
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
            textController.text = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
          }
        },
        validator: (value) => value?.isEmpty ?? true ? '$label is required' : null,
      ),
    );
  }

  Widget _buildTimeField(String label, TextEditingController textController) {
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
          suffixIcon: const Icon(Icons.access_time),
        ),
        onTap: () async {
          final time = await showTimePicker(
            context: Get.context!,
            initialTime: TimeOfDay.now(),
          );
          if (time != null) {
            textController.text = '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
          }
        },
        validator: (value) => value?.isEmpty ?? true ? '$label is required' : null,
      ),
    );
  }
}
