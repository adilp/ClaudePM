/**
 * Image Upload Hook
 * Handles uploading images to tickets
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiUrl, getApiKey } from '../services/api';

interface UploadImageParams {
  ticketId: string;
  imageBlob: Blob;
  filename?: string;
}

interface UploadImageResponse {
  success: boolean;
  filename: string;
  path: string;
  markdownRef: string;
}

async function uploadImage({ ticketId, imageBlob, filename }: UploadImageParams): Promise<UploadImageResponse> {
  const formData = new FormData();
  formData.append('image', imageBlob, filename || 'pasted-image.png');

  const baseUrl = await getApiUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}/api/tickets/${ticketId}/images`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload image');
  }

  return response.json();
}

export function useUploadImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadImage,
    onSuccess: (_, { ticketId }) => {
      // Invalidate ticket content to reflect any changes
      queryClient.invalidateQueries({
        queryKey: ['ticket', ticketId],
      });
      queryClient.invalidateQueries({
        queryKey: ['ticketContent', ticketId],
      });
    },
  });
}
