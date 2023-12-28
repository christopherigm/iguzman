import React from 'react';
import {
  Swiper,
  SwiperSlide
} from 'swiper/react';
import 'src/modules/examples/swiper/swiper.scss';

const SwiperSample = (): React.ReactElement => {
  return (
    <>
      <Swiper
        className='Swiper'
        spaceBetween={50}
        slidesPerView={1}
        onSlideChange={() => console.log('slide change')}
        onSwiper={(swiper) => console.log(swiper)}
      >
        <SwiperSlide className='Swiper__slide'>
          <div
            className='Swiper__content'
            style={{
              backgroundImage: 'url(https://wallsdesk.com/wp-content/uploads/2016/11/Mountain-Lion-4K.jpg)'
            }}>
          </div>
        </SwiperSlide>
        <SwiperSlide className='Swiper__slide'>
          <div
            className='Swiper__content'
            style={{
              backgroundImage: 'url(https://wallpapercave.com/wp/wp1956450.jpg)'
            }}>
          </div>
        </SwiperSlide>
        <SwiperSlide className='Swiper__slide'>
          <div
            className='Swiper__content'
            style={{
              backgroundImage: 'url(https://wallsdesk.com/wp-content/uploads/2016/11/Mountain-Lion-4K.jpg)'
            }}>
          </div>
        </SwiperSlide>
        <SwiperSlide className='Swiper__slide'>
          <div
            className='Swiper__content'
            style={{
              backgroundImage: 'url(https://wallpapercave.com/wp/wp1956450.jpg)'
            }}>
          </div>
        </SwiperSlide>
      </Swiper>
    </>
  );
};

export default SwiperSample;
