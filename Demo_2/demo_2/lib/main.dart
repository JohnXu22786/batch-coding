import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:video_compress/video_compress.dart';

void main() {
  runApp(const Demo2App());
}

class Demo2App extends StatelessWidget {
  const Demo2App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Audio Separation - Demo 2',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const VideoInfoScreen(),
    );
  }
}

class VideoInfoScreen extends StatefulWidget {
  const VideoInfoScreen({super.key});

  @override
  State<VideoInfoScreen> createState() => _VideoInfoScreenState();
}

class _VideoInfoScreenState extends State<VideoInfoScreen> {
  final List<VideoInfoItem> _items = [];
  bool _isProcessing = false;

  Future<void> _pickVideos() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.video,
      allowMultiple: true,
    );

    if (result == null || result.files.isEmpty) return;

    setState(() {
      for (final file in result.files) {
        if (file.path != null) {
          _items.add(VideoInfoItem(
            videoPath: file.path!,
            videoName: file.name,
          ));
        }
      }
    });
  }

  Future<void> _loadMediaInfo(VideoInfoItem item) async {
    if (!mounted) return;
    setState(() => item.status = InfoStatus.loading);

    try {
      final info = await VideoCompress.getMediaInfo(item.videoPath);
      if (!mounted) return;
      setState(() {
        item.mediaInfo = info;
        item.status = InfoStatus.loaded;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        item.error = e.toString();
        item.status = InfoStatus.failed;
      });
    }
  }

  Future<void> _loadAllInfo() async {
    if (!mounted) return;
    setState(() => _isProcessing = true);

    try {
      // Snapshot to prevent concurrent modification if items are removed
      final snapshot = List<VideoInfoItem>.from(_items);
      for (final item in snapshot) {
        if (item.status == InfoStatus.pending) {
          await _loadMediaInfo(item);
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
        title: const Text('Audio Separation (video_compress)'),
        backgroundColor: theme.colorScheme.inversePrimary,
        actions: [
          if (_items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep),
              tooltip: 'Clear all',
              onPressed: _clearAll,
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
                    'Tap the button below to pick videos\nand view their audio track information',
                    textAlign: TextAlign.center,
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
                return _VideoInfoCard(
                  item: item,
                  onLoadInfo: () => _loadMediaInfo(item),
                  onRemove: () => _removeItem(index),
                );
              },
            ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_items.isNotEmpty && !_isProcessing)
            FloatingActionButton.extended(
              heroTag: 'load_all',
              onPressed: _loadAllInfo,
              icon: const Icon(Icons.info),
              label: const Text('Load All Info'),
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

enum InfoStatus { pending, loading, loaded, failed }

class VideoInfoItem {
  final String videoPath;
  final String videoName;
  InfoStatus status;
  MediaInfo? mediaInfo;
  String? error;

  VideoInfoItem({
    required this.videoPath,
    required this.videoName,
    this.status = InfoStatus.pending,
    this.mediaInfo,
    this.error,
  });
}

class _VideoInfoCard extends StatelessWidget {
  final VideoInfoItem item;
  final VoidCallback onLoadInfo;
  final VoidCallback onRemove;

  const _VideoInfoCard({
    required this.item,
    required this.onLoadInfo,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.video_file, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.videoName,
                    style: theme.textTheme.bodyMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (item.status == InfoStatus.pending)
                  IconButton(
                    icon: const Icon(Icons.info),
                    tooltip: 'Load info',
                    onPressed: onLoadInfo,
                  ),
                if (item.status == InfoStatus.loading)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                if (item.status == InfoStatus.loaded)
                  Icon(Icons.check_circle, color: Colors.green[600]),
                if (item.status == InfoStatus.failed)
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Colors.orange),
                    tooltip: 'Retry',
                    onPressed: onLoadInfo,
                  ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: onRemove,
                ),
              ],
            ),
            _buildInfoContent(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoContent(ThemeData theme) {
    switch (item.status) {
      case InfoStatus.pending:
        return const SizedBox.shrink();
      case InfoStatus.loading:
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('Loading media information...',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.outline)),
        );
      case InfoStatus.loaded:
        return _buildMediaInfoDisplay(theme);
      case InfoStatus.failed:
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            'Failed: ${item.error ?? "Unknown error"}',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.red),
          ),
        );
    }
  }

  Widget _buildMediaInfoDisplay(ThemeData theme) {
    final info = item.mediaInfo;
    if (info == null) return const SizedBox.shrink();

    final items = <MapEntry<String, String>>[
      MapEntry('Path', info.path ?? 'N/A'),
      MapEntry('Title', info.title ?? 'N/A'),
      MapEntry('Duration', _formatDuration((info.duration ?? 0).round())),
      MapEntry('File Size', _formatFileSize(info.filesize ?? 0)),
      MapEntry('Width', '${info.width ?? "N/A"} px'),
      MapEntry('Height', '${info.height ?? "N/A"} px'),
    ];

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Video / Audio Info',
              style: theme.textTheme.labelMedium
                  ?.copyWith(fontWeight: FontWeight.bold)),
          const Divider(height: 8),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 1),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 80,
                      child: Text('${e.key}:',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    Expanded(
                      child: Text(e.value,
                          style: theme.textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 4),
          Text(
            'Note: video_compress extracts audio info via native code\n'
            '(no FFmpeg). The audio track is part of the video container.\n'
            'Use includeAudio:false in compressVideo to separate audio.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.outline, fontSize: 11),
          ),
        ],
      ),
    );
  }

  String _formatDuration(int millis) {
    final sec = (millis / 1000).round();
    final min = sec ~/ 60;
    final remainingSec = sec % 60;
    return '${min}m ${remainingSec}s';
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
