export default class BaseClass {
  public GetGetterKeys<T extends Object>(instance: T): Array<string> {
    return Object.entries(
      Object.getOwnPropertyDescriptors(
        Reflect.getPrototypeOf(instance)
      )
    )
    .filter(e => {
      return typeof e[1].get === 'function' && e[0] !== '__proto__'
    })
    .map(e => e[0])
  }

  public GetAPIData<T extends Object>(instance: T) {
    Object.keys(instance).forEach((key, i) => {
      if (key.search(/Keys/i) > -1) {
        console.log(Object.values(instance)[i] ?? '');
      }
    });
  }
}

// public sayHello(): string {
//   // for (i in this) {
//   //   console.log(i);
//   // }
//   const attr: {
//     [index: string]: string | number | boolean | any;
//   } = {};
//   // console.log(Object.keys(this.attributes));
//   Object.keys(this.attributes).forEach((key, i) => {
//     // console.log(key, typeof attr[key]);
//     attr[key.substring(1, key.length)] = Object.values(this.attributes)[i].value;
//   });
//   // console.log(this.listGetters());
//   // console.log(JSON.stringify(this.attributes.getters));
//   return `Hello ${this.attributes.name} - ${this.attributes.slug}`;
// }

