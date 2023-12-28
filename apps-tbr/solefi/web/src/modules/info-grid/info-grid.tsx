import React, {
  useEffect
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import setInfoGridData from 'src/modules/info-grid/redux/info-grid-actions';
import fetchData from 'src/modules/info-grid/redux/fetch-info-grid-data';
import Title from 'src/modules/title/title';
import SubTitle from 'src/modules/sub-title/sub-title';
import InfoGridItem from 'src/modules/info-grid/info-grid-item/info-grid-item';

const InfoGrid = (): React.ReactElement => {
  const dispatch = useDispatch();
  const infoGridData = useSelector((state: any) => state.infoGrid);
  const attr = infoGridData.data ? infoGridData.data.attributes ? infoGridData.data.attributes : {} : {};
  const infoGridItems = infoGridData.data && infoGridData.data.relationships &&
    infoGridData.data.relationships.items && infoGridData.data.relationships.items.data ?
    infoGridData.data.relationships.items.data : [];
  const HideShadowTitle = false;

  useEffect(() => {
    let version = attr.version ? attr.version : 0;
    if ( infoGridItems.length && !infoGridItems[0].attributes ) {
      version = 0;
    }
    fetchData( version )
      .then((d: any) => {
        if ( d ) dispatch(setInfoGridData(d));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [fetchData]);

  return (
    <div className='container row'>
      { attr.title ? <Title text = {attr.title} color='#2196f3' shadow={HideShadowTitle}/> : null }
      { attr.sub_title ? <SubTitle text = {attr.sub_title} /> : null }
      {
        infoGridItems.map((item: any) => {
          return (
            <InfoGridItem
              key = {item.id}
              attr = {item.attributes}
            />
          );
        })
      }
    </div>
  );
};

export default InfoGrid;
