import 'dart:io';

import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class VideoPlayerPage extends StatefulWidget {
  final String title;
  final File? file;
  final String? networkUrl;

  const VideoPlayerPage({
    super.key,
    required this.title,
    this.file,
    this.networkUrl,
  }) : assert(file != null || networkUrl != null);

  @override
  State<VideoPlayerPage> createState() => _VideoPlayerPageState();
}

class _VideoPlayerPageState extends State<VideoPlayerPage> {
  late final VideoPlayerController _videoController;
  ChewieController? _chewieController;
  String? _error;

  @override
  void initState() {
    super.initState();
    _videoController = widget.file != null
        ? VideoPlayerController.file(widget.file!)
        : VideoPlayerController.networkUrl(Uri.parse(widget.networkUrl!));
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await _videoController.initialize();
      setState(() {
        _chewieController = ChewieController(
          videoPlayerController: _videoController,
          autoPlay: true,
          looping: false,
        );
      });
    } catch (e) {
      setState(() => _error = 'Gagal memutar video: $e');
    }
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: _error != null
            ? Text(_error!, style: const TextStyle(color: Colors.white))
            : _chewieController == null
                ? const CircularProgressIndicator()
                : Chewie(controller: _chewieController!),
      ),
    );
  }
}
