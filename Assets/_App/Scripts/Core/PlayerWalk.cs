// =============================================================================
// PlayerWalk.cs - Controle simples de movimento em primeira pessoa
// =============================================================================
using UnityEngine;

public class PlayerWalk : MonoBehaviour
{
    [Header("Configuracao")]
    [SerializeField] private float velocidade = 5f;
    [SerializeField] private float sensibilidade = 2f;
    [SerializeField] private float forcaGravidade = -20f;
    
    private CharacterController cc;
    private float yaw;
    private float pitch;
    private Vector3 movimentoVertical;
    
    private void Awake()
    {
        cc = GetComponent<CharacterController>();
    }
    
    private void Start()
    {
        var e = transform.eulerAngles;
        yaw = e.y;
        pitch = e.x > 180f ? e.x - 360f : e.x;
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }
    
    private void Update()
    {
        // Cursor
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        else if (Input.GetMouseButtonDown(0) && Cursor.lockState != CursorLockMode.Locked)
        {
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }
        
        // Olhar com mouse
        if (Cursor.lockState == CursorLockMode.Locked)
        {
            float mx = Input.GetAxis("Mouse X") * sensibilidade;
            float my = Input.GetAxis("Mouse Y") * sensibilidade;
            yaw += mx;
            pitch = Mathf.Clamp(pitch - my, -90f, 90f);
            transform.rotation = Quaternion.Euler(0, yaw, 0);
        }
        
        // Movimento
        float moveX = Input.GetAxisRaw("Horizontal");
        float moveZ = Input.GetAxisRaw("Vertical");
        
        Vector3 movimento = transform.right * moveX + transform.forward * moveZ;
        movimento = movimento.normalized * velocidade;
        
        // Gravidade
        if (cc.isGrounded)
        {
            movimentoVertical.y = -0.5f;
        }
        else
        {
            movimentoVertical.y += forcaGravidade * Time.deltaTime;
        }
        movimento.y = movimentoVertical.y;
        
        cc.Move(movimento * Time.deltaTime);
    }
}
