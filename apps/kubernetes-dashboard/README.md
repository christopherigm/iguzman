Install

```sh
helm install kubernetes-dashboard deployment -n kube-system
```

Uninstall
```sh
helm uninstall kubernetes-dashboard -n kube-system
```

Install and uninstall
```sh
helm uninstall kubernetes-dashboard -n kube-system && \
helm install kubernetes-dashboard deployment -n kube-system
```
`
kubectl -n kube-system get secret

kubectl -n kube-system describe secrets microk8s-dashboard-token


