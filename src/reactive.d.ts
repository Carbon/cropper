declare module Carbon {
  export class Reactive {
    on(name: string, callback: Function);

    trigger(any);
  }
}
