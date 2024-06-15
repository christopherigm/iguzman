import { ReactElement, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import { Signal, signal } from '@preact-signals/safe-react';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { GenericFormButtons, GenericImageInput } from '@repo/ui';
import Product from 'classes/product/product';
import Service from 'classes/service/service';
import InputAdornment from '@mui/material/InputAdornment';

const complete: Signal<boolean> = signal(false);
const error: Signal<string> = signal('');

type Props = {
  children?: ReactElement | Array<ReactElement>;
  isLoading: boolean;
  darkMode: boolean;
  label: string;
  item: Product | Service;
  checkCompleteness: () => void;
  onCancel: () => void;
  onComplete: () => void;
};

const BaseBuyableItemForm = ({
  children,
  isLoading = false,
  darkMode = false,
  label,
  item,
  checkCompleteness,
  onCancel,
  onComplete,
}: Props): ReactElement => {
  useEffect(() => {
    console.log('BaseBuyableItemForm.tsx > renders');
    complete.value = false;
    error.value = '';
  }, []);

  return (
    <>
      <Typography variant="body1">Informacion basica del {label}</Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={12}>
          <Box width={250} margin="0 auto">
            <GenericImageInput
              label={`Foto principal del ${label}`}
              language="es"
              onChange={(img: string) => (item.attributes.img_picture = img)}
              height={250}
              width="100%"
              defaultValue={item.attributes.img_picture}
            />
          </Box>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label={`Nombre del ${label}`}
            variant="outlined"
            size="small"
            type="text"
            required={true}
            value={item.attributes.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              item.attributes.name = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label={`Descripcion corta del ${label}`}
            variant="outlined"
            size="small"
            type="text"
            name="short_description"
            required={true}
            value={item.attributes.short_description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              item.attributes.short_description = e.target.value;
              checkCompleteness();
            }}
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label={`Descripcion larga del ${label}`}
            variant="outlined"
            size="small"
            type="text"
            multiline={true}
            rows={4}
            name="description"
            value={item.attributes.description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (item.attributes.description = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Link personalizado"
            variant="outlined"
            size="small"
            type="url"
            name="href"
            value={item.attributes.href}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (item.attributes.href = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={item.attributes.publish_on_the_wall}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    (item.attributes.publish_on_the_wall = e.target.checked)
                  }
                />
              }
              name="publish_on_the_wall"
              label={`Publicar ${label} en pagina principal`}
              disabled={isLoading}
            />
          </FormGroup>
        </Grid>
        {item.type === 'Product' ? (
          <Grid item xs={12} sm={6}>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={item.attributes.unlimited_stock}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      (item.attributes.unlimited_stock = e.target.checked)
                    }
                  />
                }
                name="unlimited_stock"
                label={`Stock ilimitado del ${label}`}
                disabled={isLoading}
              />
            </FormGroup>
          </Grid>
        ) : null}

        <Grid item xs={12}>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">Precio del {label}</Typography>
        </Grid>

        <Grid item xs={6} md={3}>
          <TextField
            label={`Precio del ${label}`}
            variant="outlined"
            size="small"
            type="number"
            name="price"
            value={item.attributes.price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (item.attributes.price = Number(e.target.value))
            }
            required={true}
            disabled={isLoading}
            style={{ width: '100%' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField
            label={`Descuento del ${label}`}
            variant="outlined"
            size="small"
            type="number"
            name="discount"
            value={item.attributes.discount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (item.attributes.discount = Number(e.target.value))
            }
            disabled={isLoading}
            style={{ width: '100%' }}
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField
            label={`Precio final del ${label}`}
            variant="outlined"
            size="small"
            type="number"
            name="final_price"
            value={item.attributes.final_price}
            disabled={true}
            style={{ width: '100%' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
          />
        </Grid>
        {item.type === 'Product' || item.type === 'Service' ? (
          <Grid item xs={6} md={3}>
            <TextField
              label={`Costo de envio del ${label}`}
              variant="outlined"
              size="small"
              type="number"
              name="shipping_cost"
              value={item.attributes.shipping_cost}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                (item.attributes.shipping_cost = Number(e.target.value))
              }
              disabled={isLoading}
              style={{ width: '100%' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
            />
          </Grid>
        ) : null}

        {item.type === 'Product' || item.type === 'Service' ? (
          <>
            {!item.attributes.unlimited_stock ? (
              <Grid item xs={6} md={3}>
                <TextField
                  label={`Stock del ${label}`}
                  variant="outlined"
                  size="small"
                  type="number"
                  name="stock"
                  value={item.attributes.stock}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    (item.attributes.stock = Number(e.target.value))
                  }
                  disabled={isLoading}
                  style={{ width: '100%' }}
                />
              </Grid>
            ) : null}
          </>
        ) : null}

        <Grid item xs={12}></Grid>

        {children}

        <Grid item xs={12}>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">Otra informacion del {label}</Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            label={`Link de video del ${label}`}
            variant="outlined"
            size="small"
            type="url"
            name="video_link"
            value={item.attributes.video_link}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              (item.attributes.video_link = e.target.value)
            }
            disabled={isLoading}
            style={{ width: '100%' }}
          />
        </Grid>

        <Grid item xs={12}>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <Typography variant="body1">Informacion de soporte</Typography>
        </Grid>

        {item.type === 'Product' || item.type === 'Service' ? (
          <>
            <Grid item xs={12} sm={6} md={5}>
              <TextField
                label="Email de soporte"
                variant="outlined"
                size="small"
                type="email"
                name="support_email"
                value={item.attributes.support_email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (item.attributes.support_email = e.target.value)
                }
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="Telefono de soporte"
                variant="outlined"
                size="small"
                type="email"
                name="support_phone"
                value={item.attributes.support_phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (item.attributes.support_phone = e.target.value)
                }
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="Dias de soporte"
                variant="outlined"
                size="small"
                type="number"
                name="warranty_days"
                value={item.attributes.warranty_days}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (item.attributes.warranty_days = Number(e.target.value))
                }
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Informacion de soporte"
                variant="outlined"
                size="small"
                type="text"
                multiline={true}
                rows={4}
                name="support_info"
                value={item.attributes.support_info}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  (item.attributes.support_info = e.target.value)
                }
                disabled={isLoading}
                style={{ width: '100%' }}
              />
            </Grid>
          </>
        ) : null}
      </Grid>
      <GenericFormButtons
        language="es"
        label="Producto"
        canDelete={true}
        id={item.id}
        isLoading={isLoading}
        canSubmit={item.attributes.name.length > 2}
        complete={item.id ? true : false}
        onCancel={() => onCancel()}
        onDelete={() => {}}
        onComplete={() => onComplete()}
      />
    </>
  );
};

export default BaseBuyableItemForm;
