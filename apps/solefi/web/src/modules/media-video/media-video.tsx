import React from 'react';
import ParallaxBackground from 'src/modules/media-video/parallax-background';
import 'src/modules/media-video/media-video.scss';
import { useSelector } from 'react-redux';

const MediaVideo = (): React.ReactElement => {
  const system = useSelector((state: any) => state.system);
  const prefix = system.platform.prefix;
  const logoFile = '/assets/play-button.svg';
  const logoUrl = `${prefix}${logoFile}`;
  const imageFile = '/assets/parallaxbackground.jpg';
  const imageUrl = `${prefix}${imageFile}`;

return (
  <div>
    <ParallaxBackground
      image={imageUrl}
      video='https://www.youtube.com/watch?v=Kcy9S94kYgI'
      icon={logoUrl}
    />
  </div>
  );
};

export default MediaVideo;
