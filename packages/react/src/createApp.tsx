import { createStore } from '@modern-js-reduck/store';
import {
  createContext,
  useContext,
  PropsWithChildren,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import invariant from 'invariant';
import { UseModel } from '@modern-js-reduck/store/dist/types/types';
import { createBatchManager } from './batchManager';

type Config = Parameters<typeof createStore>[0];
type Store = ReturnType<typeof createStore>;

const shadowEqual = (a: any, b: any) => {
  if (
    Object.prototype.toString.call(a) !== '[object Object]' ||
    Object.prototype.toString.call(b) !== '[object Object]'
  ) {
    return a === b;
  }

  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }

  return Object.keys(a).every(key => a[key] === b[key]);
};

const createApp = (config: Config) => {
  const Context = createContext<{
    store: Store;
    batchManager: ReturnType<typeof createBatchManager>;
  }>(null as any);

  const Provider = (
    props: PropsWithChildren<{ store?: Store; _config?: Config }>,
  ) => {
    const { children, store: storeFromProps, _config } = props;
    const store = storeFromProps || createStore({ ...config, ..._config });
    const batchManager = createBatchManager(store);

    return (
      <Context.Provider value={{ store, batchManager }}>
        {children}
      </Context.Provider>
    );
  };

  const useModel: Store['use'] = (...args: any[]) => {
    const context = useContext(Context);

    invariant(
      Boolean(context),
      'You should wrap your Component in CreateApp().Provider.',
    );

    const { store, batchManager } = context;
    const initialValue = useMemo(() => store.use(...args), []);
    const [modelValue, setModelValue] = useState(initialValue);

    const lastValueRef = useRef<ReturnType<typeof store.use>>(initialValue);

    useEffect(() => {
      const unsubsribe = initialValue[2](() => {
        const newValue = store.use(...args);

        if (
          !shadowEqual(lastValueRef.current[0], newValue[0]) ||
          !shadowEqual(lastValueRef.current[1], newValue[1])
        ) {
          batchManager.pushUpdate(() => {
            setModelValue(newValue);
            lastValueRef.current = newValue;
          });
        }
      });

      batchManager.addModels(...args);

      return () => {
        unsubsribe();
        batchManager.removeModels(...args);
      };
    }, []);

    return modelValue;
  };

  const useStaticModel: Store['use'] = (...args: any[]) => {
    const context = useContext(Context);

    invariant(
      Boolean(context),
      'You should wrap your Component in CreateApp().Provider.',
    );

    const { store } = context;
    const [state, actions, subscribe] = useMemo(() => store.use(...args), []);
    const value = useRef<ReturnType<UseModel> | any>([
      state,
      actions,
      subscribe,
    ]);

    useEffect(() => {
      if (Object.prototype.toString.call(state) === '[object Object]') {
        return subscribe(() => {
          const [newState, newActions] = store.use(...args);

          // merge data to old reference
          Object.assign(value.current[0], newState);
          Object.assign(value.current[1], newActions);
        });
      }

      return () => {
        // do nothing
        // forbid eslint error
      };
    }, []);

    return value.current;
  };

  return {
    Provider,
    useModel,
    useStaticModel,
  };
};

export default createApp;