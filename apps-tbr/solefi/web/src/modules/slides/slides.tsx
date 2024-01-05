/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines */
import React, {
  useEffect,
  useState
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import {
  Swiper,
  SwiperSlide
} from 'swiper/react';
import setSlidesData from 'src/modules/slides/redux/slides-actions';
import fetchData from 'src/modules/slides/redux/fetch-slides-data';
import 'src/modules/slides/slides.scss';
import WhiteTextBox from 'src/modules/white-text-box/white-text-box';

const triangleFile = '/assets/white-triangle.png';
const sliderNextButtonFile = '/assets/slider-button-next.svg';
const sliderPrevButtonFile = '/assets/slider-button-prev.svg';

const SlideAddons = ( props: any ): React.ReactElement => {
  const system = useSelector((state: any) => state.system);
  const prefix = system.platform.prefix;
  const triangleURL = `${prefix}${triangleFile}`;
  const sliderNextButtonFileURL = `${prefix}${sliderNextButtonFile}`;
  const sliderPrevButtonFileURL = `${prefix}${sliderPrevButtonFile}`;
  const swiper = props.swiper;

  return (
    <>
      <div
        className='Swiper__navigation-button Swiper__navigation-button--left z-depth-2'
        style={{ backgroundImage: `url(${sliderPrevButtonFileURL})` }}
        onClick={() => {
          if ( swiper ) swiper.slidePrev();
        }}></div>
      <div
        className='Swiper__navigation-button Swiper__navigation-button--right z-depth-2'
        style={{ backgroundImage: `url(${sliderNextButtonFileURL})` }}
        onClick={() => {
          swiper.slideNext();
        }}></div>
      <div className='swiper-pagination'></div>
      <div
        className='Swiper__triangle'
        style={{
          backgroundImage: `url(${triangleURL})`
        }}
      ></div>
      <WhiteTextBox text={props.text}/>
    </>
  );
};

const Slide = (): React.ReactElement => {
  const slidesData = useSelector((state: any) => state.slides);
  const slides = slidesData.data && slidesData.data.relationships &&
    slidesData.data.relationships.items && slidesData.data.relationships.items.data ?
    slidesData.data.relationships.items.data : [];
  const dispatch = useDispatch();
  const [text, setText] = useState('');
  const [swiperReference, setSwiperReference]: any = useState(null);

  useEffect(() => {
    fetchData()
      .then((data: any) => {
        dispatch(setSlidesData(data));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [fetchData]);

  const updateText = ( swiper: any ) => {
    const page = swiper && swiper.realIndex ? Number(swiper.realIndex) : 0;
    setText(slides && slides.length &&
      slides[page] && slides[page].attributes &&
      slides[page].attributes.description ?
      slides[page].attributes.description : '');
  };

  const onSwiper = ( swiper: any ) => {
    setSwiperReference(swiper);
    const page = swiper && swiper.realIndex ? Number(swiper.realIndex) : 0;
    setText(slides && slides.length &&
      slides[page] && slides[page].attributes &&
      slides[page].attributes.description ?
      slides[page].attributes.description : '');
  };

  return (
    <>
      <Swiper
        className='Swiper'
        autoplay={true}
        effect='slide'
        spaceBetween={0}
        slidesPerView={1}
        loop={true}
        onSlideChange={updateText}
        pagination={{
          el: '.swiper-pagination', type: 'bullets', clickable: true
        }}
        onSwiper={onSwiper}
      >
        {
          slides.map((item: any, index: any ) => {
            if ( !item.attributes ) return null;
            return (
              <SwiperSlide key={index}
                className='Swiper__slide'
                virtualIndex={index}>
                <div
                  className='Swiper__content'
                  style={{
                    backgroundImage: `url(${item.attributes.img_picture})`
                  }}>
                </div>
              </SwiperSlide>
            );
          })
        }
        <SlideAddons text={text} swiper={swiperReference} />
      </Swiper>
    </>
  );
};

export default Slide;
