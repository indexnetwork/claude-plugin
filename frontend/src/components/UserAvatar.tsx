import { useState } from 'react';
import Avatar from 'boring-avatars';
import { apiUrl } from '@/lib/api';

interface UserAvatarProps {
  id?: string;
  name?: string;
  avatar?: string | null;
  size: number;
  className?: string;
}

function resolveAvatarSrc(avatar: string): string {
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return avatar;
  }
  if (avatar.startsWith('/api/storage/')) {
    return apiUrl(avatar);
  }
  const cleanPath = avatar.startsWith('/') ? avatar.slice(1) : avatar;
  return apiUrl(`/api/storage/${cleanPath}`);
}

function BoringFallback({ id, name, size, className }: Omit<UserAvatarProps, 'avatar'>) {
  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <Avatar
        size={size}
        name={id || name || 'default'}
        variant="bauhaus"
      />
    </div>
  );
}

export default function UserAvatar({ id, name, avatar, size, className }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (!avatar || imgError) {
    return <BoringFallback id={id} name={name} size={size} className={className} />;
  }

  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <img
        src={resolveAvatarSrc(avatar)}
        alt={name || 'User'}
        width={size}
        height={size}
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );
}
