import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:easy_video_editor/easy_video_editor.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'dart:io';

void main() {
  runApp(const Demo1App());
}

class Demo1App extends StatelessWidget {
  const Demo1App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Audio Separation - Demo 1',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const AudioExtractionScreen(),
    );
  }
}

class AudioExtractionScreen extends StatefulWidget {
  const AudioExtractionScreen({super.key});

  @override
  State<AudioExtractionScreen> createState() => _AudioExtractionScreenState();
}

class _AudioExtractionScreenState extends State<AudioExtractionScreen> {
  final List<ExtractionItem> _items = [];
  bool _isProcessing = false;

  Future<void> _pickVideos() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.video,
      allowMultiple: true,
    );

    if (result == null || result.files.isEmpty) return;

    if (!mounted) return;
    setState(() {
      for (final file in result.files) {
        if (file.path != null) {
          _items.add(ExtractionItem(
            videoPath: file.path!,
            videoName: file.name,
          ));
        }
      }
    });
  }

  Future<void> _extractAudio(ExtractionItem item) async {
    if (!mounted) return;
    setState(() {
      item.status = ExtractionStatus.processing;
    });

    try {
      final dir = await getApplicationDocumentsDirectory();
      final outputDir = Directory(p.join(dir.path, 'extracted_audio'));
      if (!await outputDir.exists()) {
        await outputDir.create(recursive: true);
      }

      final baseName = p.basenameWithoutExtension(item.videoPath);
      final outputPath = p.join(outputDir.path, '$baseName.m4a');

      final editor = VideoEditorBuilder(videoPath: item.videoPath);
      final audioPath = await editor.extractAudio(outputPath: outputPath);

      if (!mounted) return;
      if (audioPath == null) {
        item.error = 'Audio extraction returned null (plugin failed silently)';
        item.status = ExtractionStatus.failed;
      } else {
        item.audioPath = audioPath;
        item.status = ExtractionStatus.completed;
      }
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      setState(() {
        item.error = e.toString();
        item.status = ExtractionStatus.failed;
      });
    }
  }

  Future<void> _extractAll() async {
    if (!mounted) return;
    setState(() => _isProcessing = true);

    try {
      for (final item in _items) {
        if (item.status == ExtractionStatus.pending) {
          await _extractAudio(item);
        }
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  void _removeItem(int index) {
    setState(() => _items.removeAt(index));
  }

  void _clearAll() {
    setState(() => _items.clear());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Audio Extraction (easy_video_editor)'),
        backgroundColor: theme.colorScheme.inversePrimary,
        actions: [
          if (_items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep),
              tooltip: 'Clear all',
              onPressed: _isProcessing ? null : _clearAll,
            ),
        ],
      ),
      body: _items.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.video_library,
                      size: 64, color: theme.colorScheme.outline),
                  const SizedBox(height: 16),
                  Text(
                    'No videos selected',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tap the button below to pick videos',
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _items.length,
              itemBuilder: (context, index) {
                final item = _items[index];
                return _ExtractionCard(
                  item: item,
                  isProcessing: _isProcessing,
                  onExtract: () => _extractAudio(item),
                  onRemove: () => _removeItem(index),
                );
              },
            ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_items.isNotEmpty && !_isProcessing)
            FloatingActionButton.extended(
              heroTag: 'extract_all',
              onPressed: _extractAll,
              icon: const Icon(Icons.audiotrack),
              label: const Text('Extract All Audio'),
            ),
          const SizedBox(height: 12),
          FloatingActionButton.extended(
            heroTag: 'pick_videos',
            onPressed: _isProcessing ? null : _pickVideos,
            icon: const Icon(Icons.video_file),
            label: const Text('Pick Videos'),
          ),
        ],
      ),
    );
  }
}

enum ExtractionStatus { pending, processing, completed, failed }

class ExtractionItem {
  final String videoPath;
  final String videoName;
  ExtractionStatus status;
  String? audioPath;
  String? error;

  ExtractionItem({
    required this.videoPath,
    required this.videoName,
    this.status = ExtractionStatus.pending,
    this.audioPath,
    this.error,
  });
}

class _ExtractionCard extends StatelessWidget {
  final ExtractionItem item;
  final bool isProcessing;
  final VoidCallback onExtract;
  final VoidCallback onRemove;

  const _ExtractionCard({
    required this.item,
    required this.isProcessing,
    required this.onExtract,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(Icons.video_file, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.videoName,
                    style: theme.textTheme.bodyMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  _buildStatusWidget(theme),
                ],
              ),
            ),
            if (item.status == ExtractionStatus.pending)
              IconButton(
                icon: const Icon(Icons.download),
                tooltip: 'Extract audio',
                onPressed: isProcessing ? null : onExtract,
              ),
            if (item.status == ExtractionStatus.completed)
              Icon(Icons.check_circle, color: Colors.green),
            if (item.status == ExtractionStatus.failed)
              IconButton(
                icon: const Icon(Icons.refresh, color: Colors.orange),
                tooltip: 'Retry',
                onPressed: isProcessing ? null : onExtract,
              ),
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              onPressed: isProcessing ? null : onRemove,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusWidget(ThemeData theme) {
    switch (item.status) {
      case ExtractionStatus.pending:
        return Text('Pending extraction',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.outline));
      case ExtractionStatus.processing:
        return Row(
          children: [
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 8),
            Text('Extracting...',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.primary)),
          ],
        );
      case ExtractionStatus.completed:
        return Text(
          'Audio saved: ${p.basename(item.audioPath ?? "")}',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: Colors.green[700]),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        );
      case ExtractionStatus.failed:
        return Text(
          'Failed: ${item.error ?? "Unknown error"}',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: Colors.red),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        );
    }
  }
}
