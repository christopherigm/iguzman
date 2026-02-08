# GenericImage Component Documentation

## Purpose

The GenericImage component is a flexible image display component that supports responsive images, blur overlays, and optional text overlays. It leverages Next.js Image component for optimized image loading and provides extensive customization options for styling and behavior.

## Props

| Prop              | Type                            | Default                                                      | Description                                 |
| ----------------- | ------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `id`              | `number`                        | `undefined`                                                  | Unique identifier for the image             |
| `uuid`            | `string`                        | `undefined`                                                  | UUID for the image                          |
| `imgPicture`      | `string`                        | `undefined`                                                  | Image source URL                            |
| `imgBackground`   | `string`                        | `undefined`                                                  | Background image URL                        |
| `name`            | `string`                        | `undefined`                                                  | Image name/title                            |
| `href`            | `string`                        | `undefined`                                                  | Link URL for the image                      |
| `fit`             | `ObjectFit`                     | `'cover'`                                                    | Image object fit property                   |
| `backgroundColor` | `string`                        | `''`                                                         | Background color for the container          |
| `rawItem`         | `any`                           | `undefined`                                                  | Raw item data                               |
| `quality`         | `50 \| 70 \| 90 \| 100`         | `90`                                                         | Image quality (50, 70, 90, 100)             |
| `sizes`           | `string`                        | `"(max-width: 768px) 100vw, (max-width: 2048px) 50vw, 33vw"` | Image sizes attribute for responsive images |
| `width`           | `MUISizes`                      | `{ xs: '100%' }`                                             | Image width                                 |
| `height`          | `MUISizes`                      | `{ xs: 350, sm: 450, md: 350 }`                              | Image height                                |
| `maxHeight`       | `string`                        | `undefined`                                                  | Maximum height for the image container      |
| `blurOverlay`     | `number`                        | `0`                                                          | Blur overlay intensity (0-20px)             |
| `borderRadius`    | `number`                        | `0`                                                          | Border radius for the container             |
| `boxShadow`       | `string`                        | `''`                                                         | Box shadow for the container                |
| `imgLoading`      | `'eager' \| 'lazy'`             | `'lazy'`                                                     | Image loading strategy                      |
| `nameBottom`      | `number`                        | `0`                                                          | Name position from bottom                   |
| `namePosition`    | `'center' \| 'left' \| 'right'` | `'center'`                                                   | Name text alignment                         |
| `opacity`         | `number`                        | `1`                                                          | Image opacity                               |
| `unoptimized`     | `boolean`                       | `false`                                                      | Whether to use unoptimized images           |
| `overflow`        | `string`                        | `'hidden'`                                                   | Overflow behavior                           |
| `className`       | `string`                        | `''`                                                         | CSS class name                              |

## Usage

```tsx
<GenericImage
  imgPicture="/path/to/image.jpg"
  name="Image Title"
  fit="cover"
  blurOverlay={5}
/>
```
