export type DriveBackupArtifact = {
  id: string;
  filename: string;
  content: string;
  mimeType: "application/json";
};

export interface DriveBackupPort {
  upload(artifact: DriveBackupArtifact): Promise<{ remoteId: string }>;
}
